import { redirect } from "next/navigation";
import { getCurrentAuthContext, hasPermission } from "@/core/auth/rbac";
import RecipesClient from "./RecipesClient";

export default async function RecipesPage() {
  const auth = await getCurrentAuthContext();
  if (!auth) redirect("/login");

  const canRead = hasPermission(auth, "production.recipe.read");
  const canWrite = hasPermission(auth, "production.recipe.write");

  if (!canRead) {
    return (
      <div className="rounded border bg-white p-5">
        <h1 className="text-lg font-semibold">Хандах эрхгүй</h1>
        <p className="mt-1 text-sm text-neutral-600">Жор харах эрх алга.</p>
      </div>
    );
  }

  return <RecipesClient canWrite={canWrite} />;
}

