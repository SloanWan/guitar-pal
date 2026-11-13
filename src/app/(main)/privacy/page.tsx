import { legalDocPage } from "@/components/docs/legalPage";

/** `docs/legal/privacy.md` / `privacy.zh.md` as a page (#492). */
const page = legalDocPage("privacy");

export const generateMetadata = page.generateMetadata;
export default page.Page;
