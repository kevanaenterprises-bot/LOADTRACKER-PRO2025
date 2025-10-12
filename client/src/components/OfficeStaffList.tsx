import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface OfficeStaff {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  role: string;
}

export function OfficeStaffList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all office staff
  const { data: officeStaff = [], isLoading } = useQuery<OfficeStaff[]>({
    queryKey: ["/api/office-staff"],
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Office staff deletion mutation
  const deleteOfficeMutation = useMutation({
    mutationFn: async (staffId: string) => {
      return await apiRequest(`/api/office-staff/${staffId}`, "DELETE");
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Office staff member deleted successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/office-staff"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete office staff member",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return <div className="text-center py-4">Loading office staff...</div>;
  }

  if (officeStaff.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-gray-500">No office staff registered yet.</p>
        <p className="text-sm text-gray-400 mt-1">Add office staff to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-gray-600 text-sm mb-4">
        Manage your office staff accounts. Each staff member can login with their username and password.
      </p>
      {officeStaff.map((staff) => (
        <div
          key={staff.id}
          className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
          data-testid={`office-card-${staff.id}`}
        >
          <div className="flex-1">
            <div className="font-semibold text-gray-900">
              {staff.firstName} {staff.lastName}
            </div>
            <div className="text-sm text-gray-600">
              <span className="font-medium">Username:</span> {staff.username}
            </div>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="destructive" 
                size="sm"
                data-testid={`button-delete-office-${staff.id}`}
              >
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Office Staff Member?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete {staff.firstName} {staff.lastName}? 
                  They will no longer be able to access the system.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteOfficeMutation.mutate(staff.id)}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ))}
    </div>
  );
}
