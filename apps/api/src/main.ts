import { setDefaultAutoSelectFamily } from "node:net";

setDefaultAutoSelectFamily(false);

await import("./index.js");
