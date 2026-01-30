import ReactMarkdown from 'react-markdown';
import content from '../../content/poor_charlie_almanack.md?raw';

export default function RenderedView() {
  return (
    <div className="reader-prose prose prose-lg max-w-none">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
