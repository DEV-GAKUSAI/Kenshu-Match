import { LegalDocument } from "@/components/legal/LegalDocument";
import { PRIVACY } from "@/lib/legal/privacy-content";

export const metadata = {
  title: "プライバシーポリシー | ケンシュウリンク",
};

export default function PrivacyPage() {
  return <LegalDocument doc={PRIVACY} />;
}
