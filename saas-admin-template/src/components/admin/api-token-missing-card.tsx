import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default () => {
  return (
    <Card className={cn("space-y-4", "border-red-500")}>
      <CardHeader>
        <CardTitle>API token not configured</CardTitle>
        <CardDescription>
          Requests to the API, including from the frontend UI, will not work
          until an API token is configured.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Please configure an API token by setting a{" "}
          <a
            className="text-primary underline"
            href="https://developers.cloudflare.com/workers/configuration/secrets/"
          >
            secret
          </a>{" "}
          named <code>API_TOKEN</code>.
        </p>
      </CardContent>
    </Card>
  );
};
