import Form from "next/form";

import { signOutAction } from "@/app/actions";

export const SignOutForm = () => {
  return (
    <Form action={signOutAction} className="w-full">
      <button
        className="w-full px-1 py-0.5 text-left text-red-500"
        type="submit"
      >
        Sign out
      </button>
    </Form>
  );
};
