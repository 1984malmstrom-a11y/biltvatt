# Arena Award PDF validation

Ten real PDF files under `awards/` are produced by the application template engine from synthetic frozen review snapshots. They are not mocked PDF placeholders or illustrations.

Independent checks use PyMuPDF 1.26.6 and Poppler (`pdfinfo`, `pdftotext`, `pdftoppm`). Each PDF must have exactly one A4 page (595.276 × 841.89 pt), parse without warnings, extract Swedish text, contain recipient/result/source/frozen time, and render successfully. Text-span boxes are checked against 24 pt page margins. See `award-pdf-validation.json` for exact per-file byte count, page size, extraction length, render path and zero-warning/clipping results.

The ten PNG page renders in the curated gallery come from Poppler. Ivory background, dark-green header, gold frame, actual Arena A vector geometry and seal keep print ink moderate. Fonts are standard Helvetica/Helvetica-Bold with WinAnsi encoding, including Å/Ä/Ö. The individual example explicitly uses “Åsa Östermalm”.

Initial rendering encountered an environment Fontconfig cache-directory warning. Re-running with an explicit writable XDG font cache resolves it; final PDF validation requires empty stderr from all Poppler commands and empty MuPDF warnings. No malformed-xref or PDF syntax warning is accepted.

Physical printer output and human typography approval remain manual release requirements.
