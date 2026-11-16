export default function InspectorIcon({ name }) {
  if (name === 'data') return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13.75 2.75h-6.5a2.5 2.5 0 0 0-2.5 2.5v13.5a2.5 2.5 0 0 0 2.5 2.5h9.5a2.5 2.5 0 0 0 2.5-2.5V8.25Z" />
    <path d="M13.75 2.75v3.5a2 2 0 0 0 2 2h3.5m-10.5 5h6.5m-6.5 3.5h4" />
  </svg>
  if (name === 'appearance') return <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
    <path fillRule="evenodd" d="m14.489 8.388-.001.006a.1.1 0 0 1-.027.028.43.43 0 0 1-.264.082h-3.186c-3.118 0-4.68 3.77-2.476 5.974a6.5 6.5 0 1 1 5.953-6.09Zm-.292 1.616c.913 0 1.736-.618 1.79-1.529a8 8 0 1 0-7.032 7.468c1.243-.147 1.527-1.639.641-2.525-1.26-1.26-.367-3.414 1.415-3.414zM10 5a1 1 0 1 1-2 0a1 1 0 0 1 2 0M6 7a1 1 0 1 0 0-2a1 1 0 0 0 0 2m0 2a1 1 0 1 1-2 0a1 1 0 0 1 2 0" />
  </svg>
  if (name === 'spectrum') return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3.75 3.75v14a2.5 2.5 0 0 0 2.5 2.5h14" />
    <path d="M7 15.5c1.6 0 1.9-8 3.6-8s2 6 3.6 6 1.9-4.5 3.5-4.5 1.5 2 2.3 2" />
  </svg>
  if (name === 'compare') return <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path fillRule="evenodd" d="m19.28 11.715-1.715-1.715H22v5.25c0 .69-.56 1.25-1.25 1.25H14V8.75c0-1.24-1.01-2.25-2.25-2.25H11V3.25c0-.69.56-1.25 1.25-1.25h8.5c.69 0 1.25.56 1.25 1.25v5.24h-4.435l1.715-1.715-1.06-1.06-2.645 2.645a1.26 1.26 0 0 0 0 1.77l2.645 2.645zM3.25 7.5h8.5c.69 0 1.25.56 1.25 1.25v12.01c0 .69-.56 1.25-1.25 1.25h-8.5c-.69 0-1.25-.56-1.25-1.25v-5.25h4.435L4.72 17.225l1.06 1.06 2.645-2.645a1.26 1.26 0 0 0 0-1.77L5.78 11.225l-1.06 1.06L6.435 14H2V8.75c0-.69.56-1.25 1.25-1.25" />
  </svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 6 12 12M6 18 18 6" /></svg>
}
