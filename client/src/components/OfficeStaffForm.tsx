import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const officeStaffSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type OfficeStaffForm = z.infer<typeof officeStaffSchema>;

export function OfficeStaffForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<OfficeStaffForm>({
    resolver: zodResolver(officeStaffSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      username: "",
      password: "",
    },
  });

  const createOfficeMutation = useMutation({
    mutationFn: async (data: OfficeStaffForm) => {
      return await apiRequest("/api/office-staff", "POST", data);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Office staff member created successfully!",
      });
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/office-staff"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create office staff member",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: OfficeStaffForm) => {
    createOfficeMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="firstName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>First Name</FormLabel>
              <FormControl>
                <Input placeholder="Jane" {...field} data-testid="input-office-firstname" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="lastName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Last Name</FormLabel>
              <FormControl>
                <Input placeholder="Doe" {...field} data-testid="input-office-lastname" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username (for login)</FormLabel>
              <FormControl>
                <Input placeholder="jane_doe" {...field} data-testid="input-office-username" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="••••••••" {...field} data-testid="input-office-password" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button 
          type="submit" 
          disabled={createOfficeMutation.isPending}
          data-testid="button-create-office-staff"
          className="w-full"
        >
          {createOfficeMutation.isPending ? "Creating..." : "Create Office Staff"}
        </Button>
      </form>
    </Form>
  );
}
