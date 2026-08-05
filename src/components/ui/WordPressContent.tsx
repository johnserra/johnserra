interface WordPressContentProps {
  html: string;
}
/**
 * WordPress applies KSES/capability-based sanitization before exposing
 * content.rendered. CMS administrator access is therefore a trusted boundary.
 */
export function WordPressContent({ html }: WordPressContentProps) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
