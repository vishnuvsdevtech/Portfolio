#!/usr/bin/env python3
"""Generate a clean, ATS-readable one-page PDF resume from resume_data.json."""
import json
import re

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, KeepTogether)

DATA = "/opt/data/resume/resume_data.json"
OUT = "/opt/data/work/Portfolio/assets/resume.pdf"

ACCENT = colors.HexColor("#1F3A5F")
GREY = colors.HexColor("#444444")
RULE = colors.HexColor("#C9CFD6")

data = json.load(open(DATA, encoding="utf-8"))
ident = data["identity"]

body = ParagraphStyle("body", fontName="Helvetica", fontSize=8.6, leading=11.4,
                      textColor=colors.HexColor("#1a1a1a"), spaceAfter=0)
small = ParagraphStyle("small", parent=body, fontSize=8.0, leading=10.4,
                       textColor=GREY)
name_s = ParagraphStyle("name", fontName="Helvetica-Bold", fontSize=19,
                        leading=21, textColor=ACCENT, spaceAfter=1)
role_s = ParagraphStyle("role", fontName="Helvetica-Bold", fontSize=9.6,
                        leading=12, textColor=GREY, spaceAfter=2)
h_s = ParagraphStyle("h", fontName="Helvetica-Bold", fontSize=8.8, leading=11,
                     textColor=ACCENT, spaceBefore=7, spaceAfter=3)
proj_s = ParagraphStyle("proj", parent=body, leftIndent=8, bulletIndent=0,
                        spaceAfter=1.6)


def rule_flowable(width=170 * mm):
    t = Table([[""]], colWidths=[width], rowHeights=[0.7])
    t.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.7, ACCENT),
                           ("TOPPADDING", (0, 0), (-1, -1), 0),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    return t


story = []
story.append(Paragraph(ident["name"], name_s))
story.append(Paragraph("Senior AI &amp; Computer Vision Engineer  ·  Full-Stack Delivery", role_s))
story.append(Paragraph(
    f'{ident["location"]}  ·  {ident["phone"]}  ·  '
    f'<link href="mailto:{ident["email"]}" color="#1F3A5F">{ident["email"]}</link>  ·  '
    'vishnuvsdevtech.github.io/Portfolio', small))
story.append(Paragraph("Open to: Bengaluru  ·  UAE / Saudi Arabia  ·  EU (sponsorship required)  ·  Remote", small))
story.append(Spacer(1, 4))
story.append(rule_flowable())

# Summary
story.append(Paragraph("PROFESSIONAL SUMMARY", h_s))
story.append(Paragraph(data["summary_core"], body))

# Experience — headline first, this is what the site was missing
story.append(Paragraph("EXPERIENCE", h_s))
for job in data["experience"]:
    story.append(Paragraph(
        f'<b>{job["title"]}</b> &nbsp;—&nbsp; {job["company"]} &nbsp;&nbsp;'
        f'<font color="#444444"><i>{job["dates"]}</i></font>', body))
    for b in job["bullets"]:
        txt = b["text"]
        # PDF has no room for fill-in placeholders; use clean phrasing instead
        txt = re.sub(r" — running at .*?fps per stream on .*$",
                     " — tuned to the frame budget of the deployed edge hardware", txt)
        txt = txt.replace("Mentored [X] junior developers", "Mentored junior developers")
        txt = txt.replace("across [X] client projects", "across multiple client projects")
        txt = re.sub(r"\[X+\]", "", txt).strip()
        story.append(Paragraph(txt, proj_s, bulletText="•"))
    story.append(Spacer(1, 2))

# Skills
story.append(Paragraph("CORE SKILLS", h_s))
rows = []
for group, meta in data["skills"].items():
    rows.append([Paragraph(f"<b>{group}</b>", small),
                 Paragraph(", ".join(meta["items"]), small)])
t = Table(rows, colWidths=[32 * mm, 138 * mm])
t.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("TOPPADDING", (0, 0), (-1, -1), 1),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
    ("LEFTPADDING", (0, 0), (-1, -1), 0),
]))
story.append(t)

# Selected projects
story.append(Paragraph("SELECTED AI &amp; COMPUTER VISION WORK", h_s))
for p in data["projects"][:6]:
    story.append(Paragraph(
        f'<b>{p["name"]}</b> — {p["desc"]} <font color="#666666">({p["stack"]})</font>',
        proj_s, bulletText="•"))

# Certs
story.append(Paragraph("CERTIFICATIONS &amp; LANGUAGES", h_s))
story.append(Paragraph(data["certs"], small))
story.append(Paragraph(data["languages"], small))

doc = SimpleDocTemplate(OUT, pagesize=A4,
                        leftMargin=17 * mm, rightMargin=17 * mm,
                        topMargin=13 * mm, bottomMargin=12 * mm,
                        title="Vishnu V S — Senior AI & Computer Vision Engineer",
                        author=ident["name"], subject="Resume")
doc.build(story)
print("wrote", OUT)
