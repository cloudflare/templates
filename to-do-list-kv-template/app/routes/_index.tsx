import { redirect } from "@remix-run/react";
import { nanoid } from "nanoid";

export const loader = () => {
  const id = nanoid();
  return redirect(`/${id}`);
};

export default function Index() {
  return <div>'Whatever you put here will not be shown'</div>;
}
