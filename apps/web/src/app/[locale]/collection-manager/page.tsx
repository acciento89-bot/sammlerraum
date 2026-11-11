import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import {
  CollectorEntry,
  collectorEntryMetadata,
} from "../../../components/marketing/collector-entry";
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== "en") return {};
  return collectorEntryMetadata(locale);
}
export default async function EntryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== "en") notFound();
  setRequestLocale(locale);
  return <CollectorEntry locale={locale} />;
}
