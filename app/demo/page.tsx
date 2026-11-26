import Workbench from "../workbench";

export default async function Demo({ searchParams }: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const { view } = await searchParams;
  return <Workbench mode="demo" initialView={view === "eval" ? "eval" : "traces"} />;
}
