import { redirect } from "next/navigation";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(`/?join=${encodeURIComponent(code.toUpperCase().slice(0, 6))}`);
}
