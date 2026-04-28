import { Container } from "@cloudflare/containers";

export class RenderContainer extends Container {
	defaultPort = 8080;
	sleepAfter = "10m";
	manualStart = false;
}
