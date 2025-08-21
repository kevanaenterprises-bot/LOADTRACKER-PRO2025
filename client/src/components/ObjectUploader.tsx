import { useState } from "react";
import type { ReactNode } from "react";
import Uppy from "@uppy/core";
import { DashboardModal } from "@uppy/react";
import "@uppy/core/dist/style.min.css";
import "@uppy/dashboard/dist/style.min.css";
import AwsS3 from "@uppy/aws-s3";
import type { UploadResult } from "@uppy/core";
import { Button } from "@/components/ui/button";

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  onGetUploadParameters: () => Promise<{
    method: "PUT";
    url: string;
  }>;
  onComplete?: (
    result: UploadResult<Record<string, unknown>, Record<string, unknown>>
  ) => void;
  onUploadStart?: () => void;
  buttonClassName?: string;
  children: ReactNode;
}

/**
 * A file upload component that renders as a button and provides a modal interface for
 * file management.
 * 
 * Features:
 * - Renders as a customizable button that opens a file upload modal
 * - Provides a modal interface for:
 *   - File selection
 *   - File preview
 *   - Upload progress tracking
 *   - Upload status display
 * 
 * The component uses Uppy under the hood to handle all file upload functionality.
 * All file management features are automatically handled by the Uppy dashboard modal.
 * 
 * @param props - Component props
 * @param props.maxNumberOfFiles - Maximum number of files allowed to be uploaded
 *   (default: 1)
 * @param props.maxFileSize - Maximum file size in bytes (default: 10MB)
 * @param props.onGetUploadParameters - Function to get upload parameters (method and URL).
 *   Typically used to fetch a presigned URL from the backend server for direct-to-S3
 *   uploads.
 * @param props.onComplete - Callback function called when upload is complete. Typically
 *   used to make post-upload API calls to update server state and set object ACL
 *   policies.
 * @param props.buttonClassName - Optional CSS class name for the button
 * @param props.children - Content to be rendered inside the button
 */
export function ObjectUploader({
  maxNumberOfFiles = 1,
  maxFileSize = 10485760, // 10MB default
  onGetUploadParameters,
  onComplete,
  onUploadStart,
  buttonClassName,
  children,
}: ObjectUploaderProps) {
  const [showModal, setShowModal] = useState(false);
  const [uppy] = useState(() =>
    new Uppy({
      restrictions: {
        maxNumberOfFiles,
        maxFileSize,
      },
      autoProceed: false,
    })
      .use(AwsS3, {
        shouldUseMultipart: false,
        getUploadParameters: async (file) => {
          try {
            console.log("ObjectUploader: Getting upload parameters for file:", file.name, file.type, file.size);
            const params = await onGetUploadParameters();
            console.log("ObjectUploader: Upload parameters received:", params);
            
            // Return the exact format expected by Uppy
            return {
              method: params.method,
              url: params.url,
              headers: {},
            };
          } catch (error) {
            console.error("ObjectUploader: Failed to get upload parameters:", error);
            throw error;
          }
        },
      })
      .on("upload", () => {
        console.log("ObjectUploader: Upload started");
        onUploadStart?.();
      })
      .on("upload-progress", (file, progress) => {
        console.log("ObjectUploader: Upload progress:", file?.name, `${progress.bytesUploaded}/${progress.bytesTotal} (${Math.round(progress.percentage || 0)}%)`);
      })
      .on("upload-success", (file, response) => {
        console.log("ObjectUploader: Upload success:", file?.name, response);
      })
      .on("upload-error", (file, error, response) => {
        console.error("ObjectUploader: Upload error for file:", file?.name);
        console.error("ObjectUploader: Error details:", error);
        console.error("ObjectUploader: Response:", response);
      })
      .on("restriction-failed", (file, error) => {
        console.error("ObjectUploader: Restriction failed:", file?.name, error);
      })
      .on("error", (error) => {
        console.error("ObjectUploader: General error:", error);
      })
      .on("info-visible", () => {
        console.log("ObjectUploader: Info visible");
      })
      .on("info-hidden", () => {
        console.log("ObjectUploader: Info hidden");
      })
      .on("complete", (result) => {
        console.log("ObjectUploader: Upload complete with result:", {
          successful: result.successful?.length || 0,
          failed: result.failed?.length || 0,
          uploadID: result.uploadID
        });
        
        if (result.failed && result.failed.length > 0) {
          console.error("ObjectUploader: Failed uploads detailed:", result.failed);
          result.failed.forEach((failure: any, index: number) => {
            console.error(`ObjectUploader: Failure ${index + 1}:`, {
              fileName: failure.name,
              fileSize: failure.size,
              fileType: failure.type,
              errorMessage: typeof failure.error === 'string' ? failure.error : failure.error?.message,
              response: failure.response
            });
          });
        }
        
        if (result.successful && result.successful.length > 0) {
          console.log("ObjectUploader: Successful uploads:", result.successful);
          result.successful.forEach((success: any, index: number) => {
            console.log(`ObjectUploader: Success ${index + 1}:`, {
              fileName: success.name,
              uploadURL: success.uploadURL,
              response: success.response
            });
          });
        }
        
        onComplete?.(result);
      })
  );

  return (
    <div>
      <Button onClick={() => setShowModal(true)} className={buttonClassName}>
        {children}
      </Button>

      <DashboardModal
        uppy={uppy}
        open={showModal}
        onRequestClose={() => setShowModal(false)}
        proudlyDisplayPoweredByUppy={false}
      />
    </div>
  );
}