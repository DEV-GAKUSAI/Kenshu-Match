import { LegalDocument } from "@/components/legal/LegalDocument";
import { TERMS } from "@/lib/legal/terms-content";

export const metadata = {
  title: "利用規約 | ケンシュウリンク",
};

export default function TermsPage() {
  return <LegalDocument doc={TERMS} />;
}
