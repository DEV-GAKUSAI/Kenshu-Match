import type { LegalArticle, LegalDocumentData, LegalTable } from "@/lib/legal/types";
import "./legal.css";

function Table({ table }: { table: LegalTable }) {
  return (
    <div className="legal-table-wrap">
      <table className="legal-table">
        <thead>
          <tr>
            {table.head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.join("|")}>
              {row.map((cell, i) => (
                <td key={i} data-label={table.head[i]}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Article({ article }: { article: LegalArticle }) {
  return (
    <div className="detail-block legal-article">
      <h3 className="detail-block__title">{article.title}</h3>
      {article.paragraphs.map((p, i) => (
        <div key={i} className="legal-para">
          {p.text && (
            <p className="detail-block__text legal-text">
              {article.numbered && <span className="legal-no">{i + 1}.</span>}
              <span>{p.text}</span>
            </p>
          )}
          {p.items && (
            <ol className="legal-items">
              {p.items.map((item) => (
                <li key={item} className="detail-block__text">
                  {item}
                </li>
              ))}
            </ol>
          )}
          {p.table && <Table table={p.table} />}
          {p.note && <p className="detail-block__text legal-note">{p.note}</p>}
        </div>
      ))}
    </div>
  );
}

export function LegalDocument({ doc }: { doc: LegalDocumentData }) {
  return (
    <main className="detail-page legal-page" style={{ maxWidth: 760 }}>
      <h1 className="hero-band__title" style={{ fontSize: 26, marginBottom: 8 }}>
        {doc.title}
      </h1>
      <p style={{ color: "var(--color-ink-soft)", fontSize: 13, marginBottom: 32 }}>
        制定日：{doc.enactedOn}　最終改定日：{doc.revisedOn}
      </p>

      {doc.chapters.map((chapter, ci) => (
        <section key={ci} className="legal-chapter">
          {chapter.title && <h2 className="legal-chapter__title">{chapter.title}</h2>}
          {chapter.articles.map((a) => (
            <Article key={a.title} article={a} />
          ))}
        </section>
      ))}

      {doc.closing && (
        <div className="detail-block legal-article">
          <h3 className="detail-block__title">{doc.closing.title}</h3>
          <Table table={doc.closing.table} />
        </div>
      )}

      <p className="detail-block__text legal-supplement">{doc.supplement}</p>
    </main>
  );
}
