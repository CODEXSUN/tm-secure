export function humanize(value: string, replacement = " "): string {
	return value.split("_").join(replacement);
}
