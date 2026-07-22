import { bootstrapApplication } from "./app/bootstrap";
import "./styles.css";

const root = document.querySelector<HTMLElement>("#app");

if (root === null) {
  throw new Error("Shovefall application root is missing.");
}

void bootstrapApplication(root);
