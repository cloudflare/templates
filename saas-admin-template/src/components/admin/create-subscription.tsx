import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { createSubscription } from "@/lib/api";
import * as z from "zod";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  price: z.number().min(0, "Price must be a positive number"),
  features: z.array(
    z.object({
      name: z.string().min(2, "Feature name must be at least 2 characters"),
      description: z.string().optional(),
    }),
  ),
});

type FormValues = z.infer<typeof formSchema>;

type Feature = {
  name: string;
  description?: string;
};

export function CreateSubscriptionButton({ apiToken }: { apiToken: string }) {
  const [open, setOpen] = useState(false);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [newFeature, setNewFeature] = useState<Feature>({
    name: "",
    description: "",
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      price: 0,
      features: [],
    },
  });

  const removeFeature = (index: number) => {
    const updatedFeatures = features.filter((_, i) => i !== index);
    setFeatures(updatedFeatures);
    form.setValue("features", updatedFeatures);
  };

  const addFeature = async () => {
    if (newFeature.name.trim()) {
      return new Promise<Feature[]>((resolve) => {
        setFeatures((prevFeatures) => {
          const updatedFeatures = [...prevFeatures, newFeature];
          form.setValue("features", updatedFeatures);
          resolve(updatedFeatures);
          return updatedFeatures;
        });
        setNewFeature({ name: "", description: "" });
      });
    }
    return features;
  };

  const onSubmit = async (data: FormValues) => {
    try {
      let currentFeatures = features;
      if (newFeature.name.trim()) {
        currentFeatures = await addFeature();
      }
      const url = new URL(window.location.href);
      const response = await createSubscription(url.origin, apiToken, {
        ...data,
        features: currentFeatures, // Use the up-to-date features
      });
      if (!response.success) {
        throw new Error("Failed to create subscription");
      }
      form.reset();
      setFeatures([]);
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
          <Plus className="mr-2 h-4 w-4" />
          Create New Subscription
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create New Subscription</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter subscription name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter subscription description"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Price</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="Enter price"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-4">
              <FormLabel>Features</FormLabel>

              <div className="space-y-2">
                {features.map((feature, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 p-2 border rounded-md"
                  >
                    <div className="flex-1">
                      <div className="font-medium">{feature.name}</div>
                      {feature.description && (
                        <div className="text-sm text-gray-500">
                          {feature.description}
                        </div>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFeature(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <div className="flex-1 space-y-2">
                  <Input
                    placeholder="Feature name"
                    value={newFeature.name}
                    onChange={(e) =>
                      setNewFeature({ ...newFeature, name: e.target.value })
                    }
                  />
                  <Input
                    placeholder="Feature description (optional)"
                    value={newFeature.description}
                    onChange={(e) =>
                      setNewFeature({
                        ...newFeature,
                        description: e.target.value,
                      })
                    }
                  />
                </div>
                <Button
                  type="button"
                  onClick={addFeature}
                  className="self-start"
                >
                  Add Feature
                </Button>
              </div>
            </div>

            <Button type="submit" className="w-full">
              Create Subscription
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
