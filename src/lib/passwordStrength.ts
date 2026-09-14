/**
 * Password strength for the sign-up and change-password forms.
 *
 * Deliberately not zxcvbn: its dictionary bundle is ~400KB for a form that
 * takes seconds. This scores what a person can act on — length first, then
 * character mix — and knocks off the patterns attackers try first: keyboard
 * and counting runs, one key held down, the classic weak passwords, and the
 * user's own email handle. The result carries one actionable hint, and the
 * form refuses anything under `fair`.
 */

export type StrengthLevel = "weak" | "fair" | "good" | "strong";

export interface PasswordStrength {
	/** 0–4; the level is a coarser read of the same number. */
	score: number;
	level: StrengthLevel;
	/** One concrete thing that would raise the score, or null at `strong`. */
	hint: string | null;
	/** Whether the form should accept this password. */
	acceptable: boolean;
}

export const PASSWORD_MIN_LENGTH = 8;

/** Lowest level the sign-up and change-password forms will submit. */
export const MIN_ACCEPTED_LEVEL: StrengthLevel = "fair";

const LEVEL_ORDER: readonly StrengthLevel[] = ["weak", "fair", "good", "strong"];

/* The passwords that top every breach list, lowercased. Small on purpose: the
   run and repeat checks below already cover most of the long tail
   ("11111111", "qwerty123", …), so this only needs the words. */
const COMMON_PASSWORDS = new Set([
	"password",
	"password1",
	"passw0rd",
	"letmein",
	"welcome",
	"welcome1",
	"admin",
	"administrator",
	"iloveyou",
	"sunshine",
	"princess",
	"football",
	"baseball",
	"monkey",
	"dragon",
	"master",
	"shadow",
	"superman",
	"batman",
	"trustno1",
	"michael",
	"jennifer",
	"charlie",
	"whatever",
	"starwars",
	"cheese",
	"computer",
	"internet",
	"guitar",
	"guitar123",
	"guitarpal",
	"changeme",
	"secret",
	"login",
	"abc123",
	"qwerty",
	"qwerty123",
	"qwertyuiop",
	"asdfghjkl",
	"zxcvbnm",
	"123456",
	"1234567",
	"12345678",
	"123456789",
	"1234567890",
	"111111",
	"000000",
	"654321",
]);

const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890"];
const RUN_LENGTH = 4;

function characterClasses(password: string): number {
	let classes = 0;
	if (/[a-z]/.test(password)) classes++;
	if (/[A-Z]/.test(password)) classes++;
	if (/[0-9]/.test(password)) classes++;
	if (/[^a-zA-Z0-9]/.test(password)) classes++;
	return classes;
}

/** "abcd", "4321", "qwer", "poiu" — any four in a row that a hand can trace. */
function hasRun(password: string): boolean {
	const lower = password.toLowerCase();
	for (let i = 0; i + RUN_LENGTH <= lower.length; i++) {
		const window = lower.slice(i, i + RUN_LENGTH);
		const reversed = Array.from(window).reverse().join("");
		if (KEYBOARD_ROWS.some((row) => row.includes(window) || row.includes(reversed))) {
			return true;
		}
		let ascending = true;
		let descending = true;
		for (let j = 1; j < RUN_LENGTH; j++) {
			const step = window.charCodeAt(j) - window.charCodeAt(j - 1);
			if (step !== 1) ascending = false;
			if (step !== -1) descending = false;
		}
		if (ascending || descending) return true;
	}
	return false;
}

/** The same character four or more times in a row. */
function hasRepeat(password: string): boolean {
	return /(.)\1{3,}/.test(password);
}

/** The local part of the email, when it is long enough to be worth matching. */
function emailHandle(email: string | undefined): string | null {
	const handle = email?.split("@")[0]?.trim().toLowerCase();
	return handle && handle.length >= 3 ? handle : null;
}

function levelOf(score: number): StrengthLevel {
	if (score >= 4) return "strong";
	if (score === 3) return "good";
	if (score === 2) return "fair";
	return "weak";
}

export function meetsLevel(level: StrengthLevel, floor: StrengthLevel): boolean {
	return LEVEL_ORDER.indexOf(level) >= LEVEL_ORDER.indexOf(floor);
}

/**
 * Score a candidate password. `email` is the address being signed up with (or
 * the account's), so the handle before the @ can be penalised.
 */
export function passwordStrength(password: string, email?: string): PasswordStrength {
	const finish = (score: number, hint: string | null): PasswordStrength => {
		const level = levelOf(score);
		return { score, level, hint, acceptable: meetsLevel(level, MIN_ACCEPTED_LEVEL) };
	};

	if (password.length < PASSWORD_MIN_LENGTH) {
		return finish(0, `Use at least ${PASSWORD_MIN_LENGTH} characters`);
	}
	if (COMMON_PASSWORDS.has(password.toLowerCase())) {
		return finish(0, "That one is on every breach list — pick something else");
	}

	let score = password.length >= 16 ? 3 : password.length >= 12 ? 2 : 1;
	const classes = characterClasses(password);
	if (classes >= 2) score++;
	if (classes >= 4) score++;

	const hints: string[] = [];
	const handle = emailHandle(email);
	if (handle && password.toLowerCase().includes(handle)) {
		score--;
		hints.push("Leave your email name out of it");
	}
	if (hasRun(password)) {
		score--;
		hints.push("Avoid runs like 1234 or qwer");
	}
	if (hasRepeat(password)) {
		score--;
		hints.push("Avoid the same character repeated");
	}
	// One kind of character is only fine once the password is long enough to
	// be a passphrase.
	if (classes === 1 && password.length < 16) {
		score--;
		hints.push("Mix in a number, a symbol or a capital");
	}

	score = Math.max(0, Math.min(4, score));
	if (hints.length === 0) {
		if (password.length < 12) hints.push("Longer is stronger — 12 characters or more");
		else if (classes < 4 && score < 4) hints.push("Add a symbol or a capital for more");
	}
	return finish(score, score >= 4 ? null : (hints[0] ?? null));
}
