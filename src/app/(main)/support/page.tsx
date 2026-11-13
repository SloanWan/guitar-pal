import { legalDocPage } from "@/components/docs/legalPage";

/** `docs/legal/support.md` / `support.zh.md` as a page (#492). */
const page = legalDocPage("support");

export const generateMetadata = page.generateMetadata;
export default page.Page;
