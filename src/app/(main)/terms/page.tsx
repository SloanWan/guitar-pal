import { legalDocPage } from "@/components/docs/legalPage";

/** `docs/legal/terms.md` / `terms.zh.md` as a page (#492). */
const page = legalDocPage("terms");

export const generateMetadata = page.generateMetadata;
export default page.Page;
