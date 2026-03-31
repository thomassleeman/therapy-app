```
pnpm ingest --with-context
```

## Here's the reasoning on each flag:
--with-context — yes, use this. This is the contextual enrichment step where an LLM prepends a short context snippet to each chunk before embedding. It's the single highest-impact retrieval technique you've implemented — Anthropic's research showed a 35–49% reduction in retrieval failures, up to 67% combined with hybrid search (which you already have). The cost is roughly $1 per million document tokens, so for Aaron's ~20 documents it'll be pennies. The semantic gap problem you've already identified (therapists saying "client went quiet" while the KB has "withdrawal rupture") is exactly what contextual enrichment helps with, because the LLM-generated prefix adds clinical terminology that the raw chunk text might not contain.

--with-parents — Parent-child chunking gives the biggest wins on heavily structured documents like legislation with nested subsections. Aaron's therapeutic content and clinical practice documents are more prose-oriented, so the 20–35% relevance improvement cited in the parent-child chunker docs is likely at the lower end for this content type. It also roughly doubles your chunk count (parents + children) and adds complexity to debugging retrieval results. I'd add this later when you're ingesting legislation and guidelines, or if you find retrieval quality lacking on the therapeutic content.

--dry-run — run this first. Do a dry run before the real thing just to confirm all the frontmatter parses cleanly