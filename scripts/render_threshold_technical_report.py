from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Preformatted

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "THRESHOLD_TECHNICAL_REPORT.md"
OUTPUT = ROOT / "THRESHOLD_TECHNICAL_REPORT.pdf"

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="ReportTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=23, leading=28, alignment=TA_CENTER, textColor=colors.HexColor("#102a43"), spaceAfter=10))
styles.add(ParagraphStyle(name="ReportSubtitle", parent=styles["Normal"], fontName="Helvetica", fontSize=10.5, leading=15, alignment=TA_CENTER, textColor=colors.HexColor("#486581"), spaceAfter=20))
styles.add(ParagraphStyle(name="H1Report", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=17, leading=21, textColor=colors.HexColor("#0b7285"), spaceBefore=15, spaceAfter=7))
styles.add(ParagraphStyle(name="H2Report", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=12.5, leading=16, textColor=colors.HexColor("#102a43"), spaceBefore=10, spaceAfter=4))
styles.add(ParagraphStyle(name="BodyReport", parent=styles["BodyText"], fontName="Helvetica", fontSize=8.7, leading=12.5, textColor=colors.HexColor("#243b53"), spaceAfter=5))
styles.add(ParagraphStyle(name="BulletReport", parent=styles["BodyText"], fontName="Helvetica", fontSize=8.7, leading=12.5, leftIndent=14, firstLineIndent=-8, bulletIndent=3, textColor=colors.HexColor("#243b53"), spaceAfter=2))
styles.add(ParagraphStyle(name="CodeReport", parent=styles["Code"], fontName="Courier", fontSize=6.7, leading=8.4, leftIndent=6, rightIndent=6, borderColor=colors.HexColor("#d9e2ec"), borderWidth=0.5, borderPadding=6, backColor=colors.HexColor("#f5f7fa"), textColor=colors.HexColor("#102a43"), spaceBefore=3, spaceAfter=6))


def text(value):
    value = escape(value)
    value = value.replace("**", "").replace("`", "")
    return value


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#d9e2ec"))
    canvas.line(18 * mm, 14 * mm, 192 * mm, 14 * mm)
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#829ab1"))
    canvas.drawString(18 * mm, 9 * mm, "Threshold technical report")
    canvas.drawRightString(192 * mm, 9 * mm, f"Page {doc.page}")
    canvas.restoreState()


def story():
    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    result = [Spacer(1, 18 * mm), Paragraph("Threshold Technical Report", styles["ReportTitle"]), Paragraph("Implementation reference for maintainers, reviewers, and coding agents", styles["ReportSubtitle"]), Paragraph("This report describes the repository as implemented. It separates verified behavior from limitations and should be used to avoid assumptions.", styles["BodyReport"]), PageBreak()]
    code = False
    block = []
    for raw in lines:
        line = raw.rstrip()
        if line.startswith("```"):
            if code:
                result.append(Preformatted("\n".join(block), styles["CodeReport"]))
                block = []
                code = False
            else:
                code = True
            continue
        if code:
            block.append(line)
            continue
        if not line:
            result.append(Spacer(1, 2))
        elif line.startswith("# "):
            result.append(Paragraph(text(line[2:]), styles["H1Report"]))
        elif line.startswith("## "):
            result.append(Paragraph(text(line[3:]), styles["H1Report"]))
        elif line.startswith("### "):
            result.append(Paragraph(text(line[4:]), styles["H2Report"]))
        elif line.startswith("- "):
            result.append(Paragraph("• " + text(line[2:]), styles["BulletReport"]))
        elif len(line) > 3 and line[0].isdigit() and line[1:3] == ". ":
            result.append(Paragraph(text(line), styles["BulletReport"]))
        else:
            result.append(Paragraph(text(line), styles["BodyReport"]))
    return result


doc = SimpleDocTemplate(str(OUTPUT), pagesize=A4, rightMargin=17 * mm, leftMargin=17 * mm, topMargin=15 * mm, bottomMargin=19 * mm, title="Threshold Technical Report", author="Threshold")
doc.build(story(), onFirstPage=footer, onLaterPages=footer)
print(OUTPUT)
