/** A guide's line with its backticked runs drawn as code: a menu path, a button, a command. */
export default function Inline({ text }: { text: string }) {
	return text.split("`").map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part));
}
