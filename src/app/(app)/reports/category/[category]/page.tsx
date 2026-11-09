import { ReportCategoryPage } from "@/components/reports/views";

export function generateStaticParams() {
  return ["portfolio", "collections", "financial", "risk", "control"].map((category) => ({ category }));
}

export default function Page() {
  return <ReportCategoryPage />;
}
