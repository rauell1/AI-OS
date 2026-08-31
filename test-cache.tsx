import { cache } from "react";
console.log("Loading cache...");
export const myCache = cache(() => 1);
console.log("Loaded cache!");
