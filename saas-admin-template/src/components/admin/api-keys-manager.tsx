import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Copy, Key, Plus, Trash2, Eye, EyeOff } from "lucide-react";

interface ApiKey {
	id: number;
	name: string;
	key: string;
	expiresAt: number | null;
	rateLimit: number | null;
	totalRequests: number;
	remainingRequests: number | null;
	lastUsedAt: number | null;
	createdAt: number;
}

export function ApiKeysManager() {
	const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
	const [loading, setLoading] = useState(true);
	const [createDialogOpen, setCreateDialogOpen] = useState(false);
	const [newKeyName, setNewKeyName] = useState("");
	const [creating, setCreating] = useState(false);
	const [visibleKeys, setVisibleKeys] = useState<Set<number>>(new Set());
	const [copiedId, setCopiedId] = useState<number | null>(null);

	useEffect(() => {
		loadApiKeys();
	}, []);

	const loadApiKeys = async () => {
		try {
			const response = await fetch("/api/api-keys");
			if (response.ok) {
				const data = await response.json();
				setApiKeys(data.apiKeys || []);
			}
		} catch (error) {
			console.error("Error loading API keys:", error);
		} finally {
			setLoading(false);
		}
	};

	const createApiKey = async () => {
		if (!newKeyName.trim()) {
			alert("Please enter a name for the API key");
			return;
		}

		setCreating(true);
		try {
			const response = await fetch("/api/api-keys", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					name: newKeyName,
					expiresIn: 60 * 60 * 24 * 90, // 90 days
					rateLimit: 1000, // 1000 requests per day
				}),
			});

			if (response.ok) {
				setCreateDialogOpen(false);
				setNewKeyName("");
				await loadApiKeys();
			} else {
				const data = await response.json();
				alert(data.error || "Failed to create API key");
			}
		} catch (error) {
			console.error("Error creating API key:", error);
			alert("Failed to create API key");
		} finally {
			setCreating(false);
		}
	};

	const deleteApiKey = async (id: number, name: string) => {
		if (!confirm(`Are you sure you want to delete the API key "${name}"?`)) {
			return;
		}

		try {
			const response = await fetch(`/api/api-keys/${id}`, {
				method: "DELETE",
			});

			if (response.ok) {
				await loadApiKeys();
			} else {
				const data = await response.json();
				alert(data.error || "Failed to delete API key");
			}
		} catch (error) {
			console.error("Error deleting API key:", error);
			alert("Failed to delete API key");
		}
	};

	const copyToClipboard = async (key: string, id: number) => {
		try {
			await navigator.clipboard.writeText(key);
			setCopiedId(id);
			setTimeout(() => setCopiedId(null), 2000);
		} catch (error) {
			console.error("Failed to copy:", error);
		}
	};

	const toggleKeyVisibility = (id: number) => {
		const newVisible = new Set(visibleKeys);
		if (newVisible.has(id)) {
			newVisible.delete(id);
		} else {
			newVisible.add(id);
		}
		setVisibleKeys(newVisible);
	};

	const maskKey = (key: string) => {
		if (key.length <= 8) return key;
		return `${key.slice(0, 4)}${"•".repeat(20)}${key.slice(-4)}`;
	};

	const formatDate = (timestamp: number | null) => {
		if (!timestamp) return "Never";
		return new Date(timestamp * 1000).toLocaleDateString();
	};

	if (loading) {
		return <div>Loading...</div>;
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-2xl font-bold">API Keys</h2>
					<p className="text-muted-foreground">
						Manage API keys for accessing your Agents and MCP servers
					</p>
				</div>
				<Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
					<DialogTrigger asChild>
						<Button>
							<Plus className="mr-2 h-4 w-4" />
							Create API Key
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Create New API Key</DialogTitle>
							<DialogDescription>
								Create a new API key to access your services. Keep it secure!
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-4 py-4">
							<div className="space-y-2">
								<Label htmlFor="keyName">API Key Name</Label>
								<Input
									id="keyName"
									placeholder="e.g., Production API Key"
									value={newKeyName}
									onChange={(e) => setNewKeyName(e.target.value)}
								/>
								<p className="text-xs text-muted-foreground">
									Choose a descriptive name to identify this key
								</p>
							</div>
							<div className="space-y-2">
								<Label>Rate Limit</Label>
								<p className="text-sm text-muted-foreground">
									1,000 requests per day (default)
								</p>
							</div>
							<div className="space-y-2">
								<Label>Expiration</Label>
								<p className="text-sm text-muted-foreground">90 days from now</p>
							</div>
						</div>
						<div className="flex justify-end gap-2">
							<Button
								variant="outline"
								onClick={() => setCreateDialogOpen(false)}
							>
								Cancel
							</Button>
							<Button onClick={createApiKey} disabled={creating}>
								{creating ? "Creating..." : "Create Key"}
							</Button>
						</div>
					</DialogContent>
				</Dialog>
			</div>

			{apiKeys.length === 0 ? (
				<Card>
					<CardContent className="flex flex-col items-center justify-center py-12">
						<Key className="h-12 w-12 text-muted-foreground mb-4" />
						<h3 className="text-lg font-semibold mb-2">No API Keys Yet</h3>
						<p className="text-muted-foreground text-center mb-4">
							Create your first API key to start accessing your services
						</p>
						<Button onClick={() => setCreateDialogOpen(true)}>
							<Plus className="mr-2 h-4 w-4" />
							Create API Key
						</Button>
					</CardContent>
				</Card>
			) : (
				<div className="grid gap-4">
					{apiKeys.map((apiKey) => (
						<Card key={apiKey.id}>
							<CardHeader>
								<div className="flex items-start justify-between">
									<div>
										<CardTitle>{apiKey.name}</CardTitle>
										<CardDescription>
											Created {formatDate(apiKey.createdAt)} •{" "}
											{apiKey.expiresAt
												? `Expires ${formatDate(apiKey.expiresAt)}`
												: "Never expires"}
										</CardDescription>
									</div>
									<Button
										variant="ghost"
										size="icon"
										onClick={() => deleteApiKey(apiKey.id, apiKey.name)}
									>
										<Trash2 className="h-4 w-4" />
									</Button>
								</div>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="space-y-2">
									<Label>API Key</Label>
									<div className="flex items-center gap-2">
										<code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono">
											{visibleKeys.has(apiKey.id)
												? apiKey.key
												: maskKey(apiKey.key)}
										</code>
										<Button
											variant="outline"
											size="icon"
											onClick={() => toggleKeyVisibility(apiKey.id)}
										>
											{visibleKeys.has(apiKey.id) ? (
												<EyeOff className="h-4 w-4" />
											) : (
												<Eye className="h-4 w-4" />
											)}
										</Button>
										<Button
											variant="outline"
											size="icon"
											onClick={() => copyToClipboard(apiKey.key, apiKey.id)}
										>
											<Copy className="h-4 w-4" />
										</Button>
										{copiedId === apiKey.id && (
											<span className="text-sm text-green-600">Copied!</span>
										)}
									</div>
								</div>

								<div className="grid grid-cols-3 gap-4 text-sm">
									<div>
										<Label>Total Requests</Label>
										<p className="text-muted-foreground">
											{apiKey.totalRequests.toLocaleString()}
										</p>
									</div>
									<div>
										<Label>Remaining Today</Label>
										<p className="text-muted-foreground">
											{apiKey.remainingRequests !== null
												? apiKey.remainingRequests.toLocaleString()
												: "Unlimited"}
										</p>
									</div>
									<div>
										<Label>Last Used</Label>
										<p className="text-muted-foreground">
											{formatDate(apiKey.lastUsedAt)}
										</p>
									</div>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			)}
		</div>
	);
}
