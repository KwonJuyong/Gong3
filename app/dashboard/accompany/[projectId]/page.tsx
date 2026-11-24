import { redirect } from "next/navigation";

export default async function ScenarioPage({ params, searchParams }: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { projectId } = await params;
  const { error, saved } = await searchParams;
  const query = new URLSearchParams({ view: "task", p: projectId });
  if (error) query.set("error", error);
  if (saved) query.set("saved", saved);
  redirect(`/dashboard?${query}`);
}
