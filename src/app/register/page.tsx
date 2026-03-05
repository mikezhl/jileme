import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type RegisterPageProps = {
  searchParams: Promise<{
    next?: string;
  }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const nextPath = params?.next;
  const normalizedNext = nextPath && nextPath.startsWith("/") ? nextPath : null;

  if (user) {
    if (normalizedNext) {
      redirect(normalizedNext);
    }
    redirect("/");
  }

  const query = normalizedNext ? `&next=${encodeURIComponent(normalizedNext)}` : "";
  redirect(`/?auth=register${query}`);
}
