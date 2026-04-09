import React, { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import "./styles.css";

const SAMPLE_PRODUCTS = [
  { producto: "MAIZ 7272 VT3P RIB C5", clase: "", descripcion: "", dosis: "", aer_q: "", dc_q: "", contado_30: "", canje_julio: "", usd_julio: "" },
  { producto: "DK7210 RR2 SD SPC", clase: "", descripcion: "", dosis: "", aer_q: "", dc_q: "", contado_30: "", canje_julio: "", usd_julio: "" },
  { producto: "Maíz DK 7210 RR2 SD SPR", clase: "", descripcion: "", dosis: "", aer_q: "", dc_q: "", contado_30: "", canje_julio: "", usd_julio: "" },
];

const EMPTY_MANUAL = {
  producto: "",
  clase: "",
  descripcion: "",
  dosis: "",
  aer_q: "",
  dc_q: "",
  contado_30: "",
  canje_julio: "",
  usd_julio: "",
};

function safeText(value) {
  return value == null ? "" : String(value).trim();
}

function toNumber(value) {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  if (!text) return null;

  const hasComma = text.includes(",");
  const hasDot = text.includes(".");
  let normalized = text.replace(/\s/g, "");

  if (hasComma && hasDot) {
    normalized = normalized.replace(/\./g, "").replace(/,/g, ".");
  } else if (hasComma) {
    normalized = normalized.replace(/,/g, ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(value) {
  if (value == null || value === "") return "";
  const num = typeof value === "number" ? value : toNumber(value);
  if (num == null) return String(value);
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

function buildGoogleSheetCsvUrl(url) {
  const trimmed = safeText(url);
  if (!trimmed) return "";
  if (trimmed.includes("tqx=out:csv") || trimmed.includes("output=csv") || trimmed.endsWith(".csv")) {
    return trimmed;
  }

  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) return trimmed;

  const sheetId = match[1];
  const gidMatch = trimmed.match(/[?&#]gid=([0-9]+)/);
  const gid = gidMatch ? gidMatch[1] : "0";

  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
}

function parseCsvText(text) {
  return new Promise((resolve, reject) => {
    Papa.parse(text, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => resolve(results),
      error: (error) => reject(error),
    });
  });
}

function normalizeImportedRows(rawRows) {
  const rows = (rawRows || [])
    .map((row) => {
      const firstValue = Array.isArray(row) ? row[0] : row;
      return {
        producto: safeText(firstValue),
        clase: "",
        descripcion: "",
        dosis: "",
        aer_q: "",
        dc_q: "",
        contado_30: "",
        canje_julio: "",
        usd_julio: "",
      };
    })
    .filter((item) => item.producto);

  if (rows.length > 0) {
    const header = rows[0].producto.toLowerCase();
    if (["producto", "articulo", "artículo", "nombre"].includes(header)) {
      return rows.slice(1);
    }
  }

  return rows;
}

function Field({ label, children }) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function SectionCard({ title, children, actions }) {
  return (
    <div className="card">
      <div className="card-header">
        <h2>{title}</h2>
        {actions ? <div className="card-actions">{actions}</div> : null}
      </div>
      <div className="card-body">{children}</div>
    </div>
  );
}

export default function App() {
  const [sheetUrl, setSheetUrl] = useState("");
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [sheetStatus, setSheetStatus] = useState("Usando artículos de ejemplo.");
  const [products, setProducts] = useState(SAMPLE_PRODUCTS);
  const [items, setItems] = useState([]);
  const [manual, setManual] = useState(EMPTY_MANUAL);
  const [header, setHeader] = useState({
    empresa: "Grupo Quemu",
    cliente: "",
    fecha: new Date().toISOString().slice(0, 10),
    listaTitulo: "Cotización de Insumos",
    observaciones: "",
    monedaNota: "Valores sujetos a disponibilidad y cambios sin previo aviso.",
  });

  const productOptions = useMemo(() => {
    return products
      .map((p) => safeText(p.producto))
      .filter(Boolean)
      .filter((value, index, self) => self.indexOf(value) === index)
      .sort((a, b) => a.localeCompare(b, "es"));
  }, [products]);

  const filteredProductOptions = useMemo(() => {
    const typed = safeText(manual.producto).toLowerCase();
    if (!typed) return productOptions;
    return productOptions.filter((name) => name.toLowerCase().includes(typed));
  }, [manual.producto, productOptions]);

  useEffect(() => {
    if (!sheetUrl.trim()) return;
    const timeout = window.setTimeout(() => {
      void loadFromSheet();
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [sheetUrl]);

  async function loadFromSheet() {
    const csvUrl = buildGoogleSheetCsvUrl(sheetUrl);
    if (!csvUrl) {
      setSheetStatus("Pegá primero el link de Google Sheets.");
      return;
    }

    setLoadingSheet(true);
    setSheetStatus("Leyendo artículos desde Google Sheets...");

    try {
      const response = await fetch(csvUrl, { method: "GET", redirect: "follow" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const csvText = await response.text();
      const parsed = await parseCsvText(csvText);
      const importedProducts = normalizeImportedRows(parsed.data || []);

      if (importedProducts.length > 0) {
        setProducts(importedProducts);
        setSheetStatus(`${importedProducts.length} artículos cargados desde Google Sheets.`);
      } else {
        setSheetStatus("La hoja se pudo leer, pero no se encontraron artículos en la columna A.");
      }
    } catch (error) {
      console.error(error);
      setSheetStatus("No se pudo leer la hoja. Verificá que sea pública y que el gid sea correcto.");
    } finally {
      setLoadingSheet(false);
    }
  }

  function applyProductByName(productName) {
    const found = products.find(
      (p) => safeText(p.producto).toLowerCase() === safeText(productName).toLowerCase()
    );
    if (!found) return;

    setManual({
      producto: found.producto || "",
      clase: found.clase || "",
      descripcion: found.descripcion || "",
      dosis: found.dosis || "",
      aer_q: found.aer_q || "",
      dc_q: found.dc_q || "",
      contado_30: found.contado_30 || "",
      canje_julio: found.canje_julio || "",
      usd_julio: found.usd_julio || "",
    });
  }

  function addManualProduct() {
    if (!safeText(manual.producto)) return;
    setItems((prev) => [...prev, { id: crypto.randomUUID(), ...manual }]);
    setManual(EMPTY_MANUAL);
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  function updateItem(id, field, value) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  }

  function resetSample() {
    setProducts(SAMPLE_PRODUCTS);
    setItems([]);
    setManual(EMPTY_MANUAL);
    setSheetStatus("Usando artículos de ejemplo.");
  }

  function exportPdf() {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text(header.empresa || "Empresa", 10, 14);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Fecha: ${header.fecha || ""}`, pageWidth - 10, 14, { align: "right" });
    doc.text(header.listaTitulo || "Cotización", 10, 24);
    doc.text(`Cliente: ${header.cliente || ""}`, 10, 30);

    autoTable(doc, {
      startY: 38,
      margin: { left: 10, right: 10 },
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 1.6, lineColor: [80, 80, 80], lineWidth: 0.2 },
      headStyles: { fillColor: [44, 62, 80], halign: "center" },
      bodyStyles: { valign: "middle" },
      head: [[
        "PRODUCTO", "CLASE", "DESCRIPCION", "DOSIS", "AER Q", "DC Q",
        "Contado 30 días", "Canje Julio", "U$S Julio"
      ]],
      body: items.map((row) => [
        safeText(row.producto),
        safeText(row.clase),
        safeText(row.descripcion),
        safeText(row.dosis),
        safeText(row.aer_q),
        safeText(row.dc_q),
        formatMoney(row.contado_30),
        formatMoney(row.canje_julio),
        formatMoney(row.usd_julio),
      ]),
    });

    const lastY = doc.lastAutoTable?.finalY ?? 50;
    if (header.observaciones || header.monedaNota) {
      const footerY = Math.min(lastY + 10, 190);
      doc.setFont("helvetica", "bold");
      doc.text("Observaciones", 10, footerY);
      doc.setFont("helvetica", "normal");
      const note = [header.observaciones, header.monedaNota].filter(Boolean).join(" | ");
      const wrapped = doc.splitTextToSize(note, pageWidth - 20);
      doc.text(wrapped, 10, footerY + 5);
    }

    const fileName = `${(header.cliente || "cotizacion").replace(/\s+/g, "_")}.pdf`;
    doc.save(fileName);
  }

  const manualFields = [
    ["producto", "Producto"],
    ["clase", "Clase"],
    ["descripcion", "Descripción"],
    ["dosis", "Dosis"],
    ["aer_q", "AER Q"],
    ["dc_q", "DC Q"],
    ["contado_30", "Contado 30 días"],
    ["canje_julio", "Canje Julio"],
    ["usd_julio", "U$S Julio"],
  ];

  return (
    <div className="app-shell">
      <div className="container">
        <div className="top-grid">
          <SectionCard title="Cotizador de insumos">
            <div className="form-grid two-cols">
              <Field label="Empresa">
                <input value={header.empresa} disabled />
              </Field>
              <Field label="Fecha">
                <input
                  type="date"
                  value={header.fecha}
                  onChange={(e) => setHeader({ ...header, fecha: e.target.value })}
                />
              </Field>
              <Field label="Cliente">
                <input
                  value={header.cliente}
                  onChange={(e) => setHeader({ ...header, cliente: e.target.value })}
                />
              </Field>
              <Field label="Título">
                <input value={header.listaTitulo} disabled />
              </Field>
              <div className="span-2">
                <Field label="Observaciones">
                  <textarea
                    rows={4}
                    value={header.observaciones}
                    onChange={(e) => setHeader({ ...header, observaciones: e.target.value })}
                  />
                </Field>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Base de artículos"
            actions={
              <>
                <button className="btn" onClick={loadFromSheet} disabled={loadingSheet}>
                  {loadingSheet ? "Conectando..." : "Conectar hoja"}
                </button>
                <button className="btn btn-secondary" onClick={resetSample}>
                  Restaurar ejemplo
                </button>
              </>
            }
          >
            <div className="stack">
              <Field label="URL de Google Sheet">
                <input
                  placeholder="Pegá el link de la hoja"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                />
              </Field>

              <div className="info-box">
                <strong>Estado</strong>
                <div>{sheetStatus}</div>
                <div className="muted">Artículos disponibles: {productOptions.length}</div>
              </div>

              <div className="info-box">
                <strong>Formato aceptado</strong>
                <div>1. Una hoja simple con los artículos solo en la columna A.</div>
                <div>La app usa esa columna como base de datos del campo Producto.</div>
                <div>2. Cada fila corresponde a un artículo distinto.</div>
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="tabs-bar">
          <div className="tab active">Agregar +</div>
          <div className="tab">Cotización</div>
        </div>

        <div className="main-grid">
          <SectionCard title="Agregar artículo">
            <div className="form-grid five-cols">
              {manualFields.map(([field, label]) => (
                <Field key={field} label={label}>
                  {field === "producto" ? (
                    <>
                      <input
                        value={manual.producto}
                        list="productos-sheet"
                        onFocus={() => {
                          if (sheetUrl.trim()) void loadFromSheet();
                        }}
                        onChange={(e) => {
                          const value = e.target.value;
                          setManual((prev) => ({ ...prev, producto: value }));

                          const exactMatch = products.find(
                            (p) => safeText(p.producto).toLowerCase() === safeText(value).toLowerCase()
                          );
                          if (exactMatch) applyProductByName(exactMatch.producto);
                        }}
                      />
                      <datalist id="productos-sheet">
                        {filteredProductOptions.map((option) => (
                          <option key={option} value={option} />
                        ))}
                      </datalist>
                    </>
                  ) : (
                    <input
                      value={manual[field]}
                      onChange={(e) => setManual((prev) => ({ ...prev, [field]: e.target.value }))}
                    />
                  )}
                </Field>
              ))}
              <div className="span-5">
                <button className="btn" onClick={addManualProduct}>Agregar a cotización</button>
              </div>
            </div>
          </SectionCard>

          <div className="preview-layout">
            <SectionCard
              title="Vista previa"
              actions={
                <button className="btn" onClick={exportPdf} disabled={items.length === 0}>
                  Exportar PDF
                </button>
              }
            >
              <div className="sheet-preview">
                <div className="sheet-header">
                  <div className="brand">{header.empresa || "Empresa"}</div>
                  <div className="sheet-title">Cotización de Insumos</div>
                  <div className="sheet-date">{header.fecha || ""}</div>
                </div>
                <div className="sheet-client">{header.cliente || "Cliente"}</div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>PRODUCTO</th>
                        <th>CLASE</th>
                        <th>DESCRIPCION</th>
                        <th>DOSIS</th>
                        <th>AER Q</th>
                        <th>DC Q</th>
                        <th>Contado 30 días</th>
                        <th>Canje Julio</th>
                        <th>U$S Julio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="empty-row">Agregá productos desde Agregar +.</td>
                        </tr>
                      ) : (
                        items.map((row) => (
                          <tr key={row.id}>
                            <td>{row.producto}</td>
                            <td>{row.clase}</td>
                            <td>{row.descripcion}</td>
                            <td>{row.dosis}</td>
                            <td>{row.aer_q}</td>
                            <td>{row.dc_q}</td>
                            <td className="num">{formatMoney(row.contado_30)}</td>
                            <td className="num">{formatMoney(row.canje_julio)}</td>
                            <td className="num">{formatMoney(row.usd_julio)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="sheet-footer">
                  {header.observaciones ? <div><strong>Observaciones:</strong> {header.observaciones}</div> : null}
                  {header.monedaNota ? <div>{header.monedaNota}</div> : null}
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Productos incluidos">
              <div className="stack">
                {items.length === 0 ? (
                  <div className="muted">Todavía no hay productos en la cotización.</div>
                ) : (
                  items.map((item) => (
                    <div key={item.id} className="item-card">
                      <div className="item-card-head">
                        <div>
                          <div className="item-title">{item.producto}</div>
                          <div className="muted">Artículo cargado</div>
                        </div>
                        <button className="btn btn-danger" onClick={() => removeItem(item.id)}>Quitar</button>
                      </div>

                      <div className="form-grid two-cols">
                        {[
                          ["clase", "Clase"],
                          ["descripcion", "Descripción"],
                          ["dosis", "Dosis"],
                          ["aer_q", "AER Q"],
                          ["dc_q", "DC Q"],
                          ["contado_30", "Contado 30 días"],
                          ["canje_julio", "Canje Julio"],
                          ["usd_julio", "U$S Julio"],
                        ].map(([field, label]) => (
                          <Field key={field} label={label}>
                            <input
                              value={item[field]}
                              onChange={(e) => updateItem(item.id, field, e.target.value)}
                            />
                          </Field>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}
