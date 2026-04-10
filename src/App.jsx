import React, { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import "./styles.css";

const FIXED_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1WcC85QL5CvA6gPLdsNOm1LX5BKPVPwBj3k5duzhbJGw/edit?usp=sharing";

const LOGO_URL = "/logo-quemu.png";

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

function looksLikeHeaderRow(value) {
  const lower = safeText(value).toLowerCase();
  return ["producto", "articulo", "artículo", "nombre"].includes(lower);
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

  if (rows.length > 0 && looksLikeHeaderRow(rows[0].producto)) {
    return rows.slice(1);
  }

  return rows;
}

function loadImageAsDataUrl(url) {
  return fetch(url)
    .then((response) => response.blob())
    .then(
      (blob) =>
        new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        })
    );
}

function Field({ label, children, className = "" }) {
  return (
    <div className={`field ${className}`}>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function Card({ title, actions, children }) {
  return (
    <section className="card">
      <div className="card-header">
        <h2>{title}</h2>
        {actions ? <div className="card-actions">{actions}</div> : null}
      </div>
      <div className="card-body">{children}</div>
    </section>
  );
}

export default function App() {
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [sheetStatus, setSheetStatus] = useState("Cargando base de artículos...");
  const [products, setProducts] = useState([]);
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
    void loadFromSheet();
  }, []);

  async function loadFromSheet() {
    const csvUrl = buildGoogleSheetCsvUrl(FIXED_SHEET_URL);

    setLoadingSheet(true);
    setSheetStatus("Cargando base de artículos...");

    try {
      const response = await fetch(csvUrl, {
        method: "GET",
        redirect: "follow",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const csvText = await response.text();
      const parsed = await parseCsvText(csvText);
      const importedProducts = normalizeImportedRows(parsed.data || []);

      if (importedProducts.length > 0) {
        setProducts(importedProducts);
        setSheetStatus(`${importedProducts.length} artículos cargados.`);
      } else {
        setSheetStatus("No se encontraron artículos en la columna A.");
      }
    } catch (error) {
      console.error("Error leyendo Google Sheets:", error);
      setSheetStatus("No se pudo cargar la base de artículos.");
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

  async function exportPdf() {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();

    try {
      const logoData = await loadImageAsDataUrl(LOGO_URL);
      doc.addImage(logoData, "PNG", 10, 6, 30, 18);
    } catch (error) {
      console.warn("No se pudo cargar el logo para el PDF", error);
    }

   doc.setFont("helvetica", "bold");
doc.setFontSize(10);
doc.text(`Fecha: ${header.fecha || ""}`, pageWidth - 10, 14, { align: "right" });

doc.setFont("helvetica", "bold");
doc.setFontSize(16);
doc.text(header.listaTitulo || "Cotización de Insumos", pageWidth / 2, 22, { align: "center" });

doc.setFont("helvetica", "normal");
doc.setFontSize(11);
doc.text(`Cliente: ${header.cliente || ""}`, 10, 34);

    autoTable(doc, {
      startY: 36,
      margin: { left: 10, right: 10 },
      theme: "grid",
      styles: {
        fontSize: 8,
        cellPadding: 1.6,
        lineColor: [80, 80, 80],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [44, 62, 80],
        halign: "center",
      },
      bodyStyles: {
        valign: "middle",
      },
      head: [[
        "PRODUCTO",
        "CLASE",
        "DESCRIPCION",
        "DOSIS",
        "AER Q",
        "DC Q",
        "Contado 30 días",
        "Canje Julio",
        "U$S Julio",
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
      columnStyles: {
        0: { cellWidth: 55 },
        1: { cellWidth: 22 },
        2: { cellWidth: 35 },
        3: { cellWidth: 16, halign: "center" },
        4: { cellWidth: 14, halign: "center" },
        5: { cellWidth: 14, halign: "center" },
        6: { cellWidth: 26, halign: "right" },
        7: { cellWidth: 22, halign: "right" },
        8: { cellWidth: 22, halign: "right" },
      },
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
        <div className="top-grid-single">
          <Card title="Cotizador de insumos">
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

              <Field label="Observaciones" className="span-2">
                <textarea
                  rows={4}
                  value={header.observaciones}
                  onChange={(e) => setHeader({ ...header, observaciones: e.target.value })}
                />
              </Field>
            </div>

            <div className="inline-status">
              <span className="status-dot" />
              <span>{loadingSheet ? "Actualizando base de artículos..." : sheetStatus}</span>
            </div>
          </Card>
        </div>

        <div className="section-title">Agregar artículo</div>

        <div className="main-grid single-column-layout">
          <Card title="Carga">
            <div className="form-grid five-cols">
              {manualFields.map(([field, label]) => (
                <Field key={field} label={label}>
                  {field === "producto" ? (
                    <>
                      <input
                        value={manual.producto}
                        list="productos-sheet"
                        onFocus={() => {
                          if (products.length === 0) void loadFromSheet();
                        }}
                        onChange={(e) => {
                          const value = e.target.value;
                          setManual((prev) => ({ ...prev, producto: value }));

                          const exactMatch = products.find(
                            (p) => safeText(p.producto).toLowerCase() === safeText(value).toLowerCase()
                          );
                          if (exactMatch) {
                            applyProductByName(exactMatch.producto);
                          }
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
                <button className="btn" onClick={addManualProduct}>
                  Agregar a cotización
                </button>
              </div>
            </div>
          </Card>

          <Card
            title="Vista previa"
            actions={
              <button className="btn" onClick={exportPdf} disabled={items.length === 0}>
                Exportar PDF
              </button>
            }
          >
            <div className="sheet-preview">
              <div className="sheet-header">
                <div className="sheet-brand-wrap" />
                <div className="sheet-title">{header.listaTitulo}</div>
                <div className="sheet-date">{header.fecha || ""}</div>
              </div>

              <div className="sheet-client-row">
                <span className="sheet-client-label">Cliente:</span>
                <span className="sheet-client-value">{header.cliente || "Sin cliente"}</span>
              </div>

              <div className="table-wrap">
                <table className="quote-table">
                  <thead>
                    <tr>
                      <th>PRODUCTO</th>
                      <th>CLASE</th>
                      <th>DESCRIPCION</th>
                      <th>DOSIS</th>
                      <th>AER Q</th>
                      <th>DC Q</th>
                      <th className="num">Contado 30 días</th>
                      <th className="num">Canje Julio</th>
                      <th className="num">U$S Julio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="empty-row">
                          Agregá productos para ver la cotización.
                        </td>
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
                {header.observaciones ? (
                  <div>
                    <strong>Observaciones:</strong> {header.observaciones}
                  </div>
                ) : null}
                {header.monedaNota ? <div>{header.monedaNota}</div> : null}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
