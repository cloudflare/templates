import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { apiEndpoints } from "@/lib/api-endpoints";
import { cn } from "@/lib/utils";

const methodStyles = (method: string) =>
  cn(method === "POST" ? "bg-green-700" : "");

export const APIDocumentation = () => {
  return (
    <div className="space-y-4">
      <Card className={cn("space-y-4")}>
        <CardHeader>
          <CardTitle>Authentication</CardTitle>
          <CardDescription>
            All requests must be authenticated by passing the API token as a
            request header. The API token is configured using{" "}
            <a
              className="text-primary underline"
              href="https://developers.cloudflare.com/workers/configuration/secrets/"
            >
              secrets
            </a>
            .
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Supported header styles</Label>

            <div className="space-y-4">
              <Input value="Authorization: Bearer $apiToken" readOnly />
              <Input value="Authorization: Token $apiToken" readOnly />
              <Input value="x-api-token: $apiToken" readOnly />
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        {apiEndpoints.map((endpoint, index) => (
          <Card key={index} className="mb-4">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Badge
                  className={methodStyles(endpoint.method)}
                  variant={
                    endpoint.method === "GET"
                      ? "default"
                      : endpoint.method === "POST"
                        ? "destructive"
                        : endpoint.method === "PUT"
                          ? "warning"
                          : "secondary"
                  }
                >
                  {endpoint.method}
                </Badge>
                <code className="text-sm font-mono">{endpoint.path}</code>
              </div>
              <CardDescription>{endpoint.description}</CardDescription>
            </CardHeader>

            <CardContent>
              <Accordion type="single" collapsible>
                {endpoint.parameters && endpoint.parameters.length > 0 && (
                  <AccordionItem value="parameters">
                    <AccordionTrigger>Parameters</AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2">
                        {endpoint.parameters.map((param, paramIndex) => (
                          <div key={paramIndex} className="border-b pb-2">
                            <div className="flex items-center gap-2">
                              <code className="text-sm font-mono">
                                {param.name}
                              </code>
                              <Badge variant="outline">{param.type}</Badge>
                              {param.required && (
                                <Badge variant="destructive">Required</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {param.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )}

                {endpoint.requestBody && (
                  <AccordionItem value="request">
                    <AccordionTrigger>Request Body</AccordionTrigger>
                    <AccordionContent>
                      <pre className="bg-muted p-4 rounded-lg overflow-auto">
                        {JSON.stringify(endpoint.requestBody.example, null, 2)}
                      </pre>
                      {endpoint.requestBody.description && (
                        <p className="text-sm text-muted-foreground mt-2">
                          {endpoint.requestBody.description}
                        </p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                )}

                {endpoint.responses.map((response, responseIndex) => (
                  <AccordionItem
                    key={responseIndex}
                    value={`response-${responseIndex}`}
                  >
                    <AccordionTrigger>
                      {endpoint.responses.length === 1
                        ? "Response"
                        : response.name}
                    </AccordionTrigger>
                    <AccordionContent>
                      <pre className="bg-muted p-4 rounded-lg overflow-auto">
                        {JSON.stringify(response.example, null, 2)}
                      </pre>
                      {response.description && (
                        <p className="text-sm text-muted-foreground mt-2">
                          {response.description}
                        </p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
