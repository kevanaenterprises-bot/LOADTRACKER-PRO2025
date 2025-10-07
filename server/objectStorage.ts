import { Storage, File } from "@google-cloud/storage";
import { Response } from "express";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

// Lazy initialization of object storage client to prevent startup crashes
let objectStorageClient: Storage | null = null;
let objectStorageError: Error | null = null;

function getObjectStorageClient(): Storage {
  if (objectStorageError) {
    throw objectStorageError;
  }
  
  if (!objectStorageClient) {
    try {
      console.log('🔧 Initializing Google Cloud Storage client...');
      
      const projectId = process.env.GCS_PROJECT_ID;
      const clientEmail = process.env.GCS_CLIENT_EMAIL;
      let privateKey = process.env.GCS_PRIVATE_KEY;
      
      if (!projectId || !clientEmail || !privateKey) {
        throw new Error('Missing GCS credentials. Required: GCS_PROJECT_ID, GCS_CLIENT_EMAIL, GCS_PRIVATE_KEY');
      }
      
      // Format private key - handle various input formats from Railway env vars
      // 1. Replace literal \n with actual newlines
      privateKey = privateKey.replace(/\\n/g, '\n');
      
      // 2. Validate PEM format
      if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
        throw new Error('GCS_PRIVATE_KEY must include -----BEGIN PRIVATE KEY----- header');
      }
      if (!privateKey.includes('-----END PRIVATE KEY-----')) {
        throw new Error('GCS_PRIVATE_KEY must include -----END PRIVATE KEY----- footer');
      }
      
      // 3. Clean up and reformat the key properly
      // Extract just the key content between headers
      const keyMatch = privateKey.match(/-----BEGIN PRIVATE KEY-----([\s\S]*?)-----END PRIVATE KEY-----/);
      if (!keyMatch) {
        throw new Error('Could not parse GCS_PRIVATE_KEY - invalid PEM format');
      }
      
      // Get the base64 content and clean it up
      const keyContent = keyMatch[1]
        .replace(/\s+/g, '') // Remove all whitespace
        .match(/.{1,64}/g)   // Split into 64-character lines
        ?.join('\n') || '';  // Join with newlines
      
      // Reconstruct the properly formatted key
      const formattedPrivateKey = `-----BEGIN PRIVATE KEY-----\n${keyContent}\n-----END PRIVATE KEY-----\n`;
      
      console.log('✅ Private key formatted successfully (length:', formattedPrivateKey.length, 'chars)');
      
      objectStorageClient = new Storage({
        projectId,
        credentials: {
          client_email: clientEmail,
          private_key: formattedPrivateKey,
        },
      });
      console.log('✅ Google Cloud Storage client initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Google Cloud Storage client:', error);
      objectStorageError = error instanceof Error ? error : new Error('Unknown object storage initialization error');
      throw objectStorageError;
    }
  }
  
  return objectStorageClient;
}

// Export the function to get the object storage client
export { getObjectStorageClient };

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// The object storage service is used to interact with the object storage service.
export class ObjectStorageService {
  constructor() {}

  // Gets the public object search paths.
  getPublicObjectSearchPaths(): Array<string> {
    // Support both Replit (PUBLIC_OBJECT_SEARCH_PATHS) and Railway (GCS_BUCKET_NAME) environments
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    
    if (paths.length === 0) {
      // For Railway, construct public path from GCS_BUCKET_NAME
      const bucketName = process.env.GCS_BUCKET_NAME;
      if (bucketName) {
        return [`gs://${bucketName}/public`];
      }
      
      throw new Error(
        "Neither PUBLIC_OBJECT_SEARCH_PATHS nor GCS_BUCKET_NAME is set. " +
        "Set GCS_BUCKET_NAME for Railway deployment or PUBLIC_OBJECT_SEARCH_PATHS for Replit."
      );
    }
    return paths;
  }

  // Gets the private object directory.
  getPrivateObjectDir(): string {
    // Support both Replit (PRIVATE_OBJECT_DIR) and Railway (GCS_BUCKET_NAME) environments
    const replitDir = process.env.PRIVATE_OBJECT_DIR;
    if (replitDir) {
      return replitDir;
    }
    
    // For Railway, construct the path from GCS_BUCKET_NAME
    const bucketName = process.env.GCS_BUCKET_NAME;
    if (bucketName) {
      return `gs://${bucketName}/private`;
    }
    
    throw new Error(
      "Neither PRIVATE_OBJECT_DIR nor GCS_BUCKET_NAME is set. " +
      "Set GCS_BUCKET_NAME for Railway deployment or PRIVATE_OBJECT_DIR for Replit."
    );
  }

  // Search for a public object from the search paths.
  async searchPublicObject(filePath: string): Promise<File | null> {
    try {
      for (const searchPath of this.getPublicObjectSearchPaths()) {
        const fullPath = `${searchPath}/${filePath}`;

        // Full path format: /<bucket_name>/<object_name>
        const { bucketName, objectName } = parseObjectPath(fullPath);
        const bucket = getObjectStorageClient().bucket(bucketName);
        const file = bucket.file(objectName);

        // Check if file exists
        const [exists] = await file.exists();
        if (exists) {
          return file;
        }
      }

      return null;
    } catch (error) {
      console.error('⚠️ Object storage not configured or available for public object search:', error);
      return null; // Gracefully return null when object storage is not available
    }
  }

  // Downloads an object to the response.
  async downloadObject(file: File, res: Response, cacheTtlSec: number = 3600) {
    try {
      // Get file metadata
      const [metadata] = await file.getMetadata();
      // Get the ACL policy for the object.
      const aclPolicy = await getObjectAclPolicy(file);
      const isPublic = aclPolicy?.visibility === "public";
      // Set appropriate headers
      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": metadata.size,
        "Cache-Control": `${
          isPublic ? "public" : "private"
        }, max-age=${cacheTtlSec}`,
      });

      // Stream the file to the response
      const stream = file.createReadStream();

      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });

      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  // Gets the upload URL for an object entity.
  async getObjectEntityUploadURL(): Promise<string> {
    try {
      const privateObjectDir = this.getPrivateObjectDir();
      if (!privateObjectDir) {
        throw new Error(
          "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
            "tool and set PRIVATE_OBJECT_DIR env var."
        );
      }

      const objectId = randomUUID();
      const fullPath = `${privateObjectDir}/uploads/${objectId}`;

      const { bucketName, objectName } = parseObjectPath(fullPath);

      // Sign URL for PUT method with TTL
      return signObjectURL({
        bucketName,
        objectName,
        method: "PUT",
        ttlSec: 900,
      });
    } catch (error) {
      console.error('⚠️ Object storage not configured or available for upload URL generation:', error);
      throw new Error('Object storage service is not available. Please configure object storage or contact support.');
    }
  }

  // Gets the object entity file from the object path.
  async getObjectEntityFile(objectPath: string): Promise<File> {
    try {
      if (!objectPath.startsWith("/objects/")) {
        throw new ObjectNotFoundError();
      }

      const parts = objectPath.slice(1).split("/");
      if (parts.length < 2) {
        throw new ObjectNotFoundError();
      }

      const entityId = parts.slice(1).join("/");
      let entityDir = this.getPrivateObjectDir();
      if (!entityDir.endsWith("/")) {
        entityDir = `${entityDir}/`;
      }
      const objectEntityPath = `${entityDir}${entityId}`;
      const { bucketName, objectName } = parseObjectPath(objectEntityPath);
      const bucket = getObjectStorageClient().bucket(bucketName);
      const objectFile = bucket.file(objectName);
      const [exists] = await objectFile.exists();
      if (!exists) {
        throw new ObjectNotFoundError();
      }
      return objectFile;
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        throw error; // Re-throw ObjectNotFoundError as-is
      }
      console.error('⚠️ Object storage not configured or available for file access:', error);
      throw new Error('Object storage service is not available. Please configure object storage or contact support.');
    }
  }

  normalizeObjectEntityPath(
    rawPath: string,
  ): string {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }
  
    // Extract the path from the URL by removing query parameters and domain
    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;
  
    let objectEntityDir = this.getPrivateObjectDir();
    
    // RAILWAY FIX: Convert gs:// format to pathname format for comparison
    if (objectEntityDir.startsWith("gs://")) {
      objectEntityDir = objectEntityDir.replace("gs://", "/");
    }
    
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }
  
    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }
  
    // Extract the entity ID from the path
    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  // Tries to set the ACL policy for the object entity and return the normalized path.
  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    try {
      const normalizedPath = this.normalizeObjectEntityPath(rawPath);
      if (!normalizedPath.startsWith("/")) {
        return normalizedPath;
      }

      const objectFile = await this.getObjectEntityFile(normalizedPath);
      await setObjectAclPolicy(objectFile, aclPolicy);
      return normalizedPath;
    } catch (error) {
      console.error('⚠️ Failed to set ACL policy on object entity:', error);
      // Return the normalized path even if ACL setting fails to avoid breaking the caller
      return this.normalizeObjectEntityPath(rawPath);
    }
  }

  // Checks if the user can access the object entity.
  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: File;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  // Use Google Cloud Storage's native signed URL generation
  console.log('🔐 Generating signed URL:', { bucketName, objectName, method, ttlSec });
  
  const storage = getObjectStorageClient();
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  
  const options = {
    version: 'v4' as const,
    action: method === 'GET' ? 'read' as const : 
            method === 'PUT' ? 'write' as const :
            method === 'DELETE' ? 'delete' as const : 
            'read' as const,
    expires: Date.now() + ttlSec * 1000,
  };
  
  console.log('🔐 Signed URL options:', options);
  
  const [signedUrl] = await file.getSignedUrl(options);
  console.log('✅ Signed URL generated:', signedUrl.substring(0, 100) + '...');
  
  return signedUrl;
}
