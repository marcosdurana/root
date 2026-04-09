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
        <div className="sheet-brand-wrap">
          <img
            src={LOGO_URL}
            alt="Grupo Quemu"
            className="sheet-logo"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        </div>

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
