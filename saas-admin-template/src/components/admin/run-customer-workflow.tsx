import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Workflow } from "lucide-react";
import { runCustomerWorkflow } from "@/lib/api";
import { useState } from "react";

export function RunCustomerWorkflowButton({
  apiToken,
  customerId,
}: {
  apiToken: string;
  customerId: string;
}) {
  const [open, setOpen] = useState(false);

  const onSubmit = async () => {
    try {
      const url = new URL(window.location.href);
      const response = await runCustomerWorkflow(
        customerId,
        url.origin,
        apiToken,
      );

      if (!response.success) {
        throw new Error("Failed to create subscription");
      }

      setOpen(false);
      window.location.reload();
    } catch (error) {
      console.error("Error creating subscription:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Workflow className="mr-2 h-4 w-4" />
          Run Customer Workflow
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Run Customer Workflow</DialogTitle>
        </DialogHeader>

        <DialogDescription>
          This will run a workflow for the customer. This is completely
          customizable and can be used to do whatever you want. Check out{" "}
          <code>src/workflows/customer.ts</code> to get started!
        </DialogDescription>

        <form onSubmit={onSubmit} className="space-y-4">
          <Button type="submit" className="w-full">
            Run Customer Workflow
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
