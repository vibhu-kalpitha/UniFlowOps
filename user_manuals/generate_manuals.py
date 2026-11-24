import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas

# ── Custom Numbered Canvas for Two-Pass Running Headers & Footers ──
class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super(NumberedCanvas, self).__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super(NumberedCanvas, self).showPage()
        super(NumberedCanvas, self).save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748B"))

        # Skip headers/footers on page 1 (cover)
        if self._pageNumber > 1:
            # Header
            self.drawString(36, 756, "UniFlow Ops v5.0 — Manufacturing Execution & Quality Control")
            doc_title = getattr(self, 'doc_manual_title', "User Manual")
            self.drawRightString(576, 756, doc_title)
            self.setStrokeColor(colors.HexColor("#CBD5E1"))
            self.setLineWidth(0.5)
            self.line(36, 750, 576, 750)

            # Footer
            self.line(36, 45, 576, 45)
            self.drawString(36, 34, "Confidential — Innovus UniFlow Ops Quality System")
            page_text = f"Page {self._pageNumber} of {page_count}"
            self.drawRightString(576, 34, page_text)

        self.restoreState()


def build_manual(filename, manual_title, role_name, subtitle, target_audience, sections):
    pdf_path = os.path.join(os.path.dirname(__file__), filename)
    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=54,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()

    # Custom Palettes
    c_brand_dark = colors.HexColor("#071B23")
    c_teal = colors.HexColor("#0D9488")
    c_teal_light = colors.HexColor("#14B8A6")
    c_navy = colors.HexColor("#0F172A")
    c_slate = colors.HexColor("#475569")
    c_bg_callout = colors.HexColor("#F0FDFA")
    c_border = colors.HexColor("#99F6E4")
    c_bg_warn = colors.HexColor("#FEFCE8")
    c_border_warn = colors.HexColor("#FDE047")

    # Typography Styles
    title_style = ParagraphStyle(
        'CoverTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=c_brand_dark,
        spaceAfter=6
    )

    subtitle_style = ParagraphStyle(
        'CoverSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=12,
        leading=16,
        textColor=c_teal,
        spaceAfter=14
    )

    h1_style = ParagraphStyle(
        'SectionH1',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=14,
        leading=18,
        textColor=c_teal,
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'SectionH2',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=c_navy,
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'BodyDark',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=c_slate,
        spaceAfter=6
    )

    bullet_style = ParagraphStyle(
        'BulletText',
        parent=body_style,
        leftIndent=14,
        firstLineIndent=-10,
        spaceAfter=3
    )

    callout_style = ParagraphStyle(
        'CalloutText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12,
        textColor=c_navy
    )

    table_header_style = ParagraphStyle(
        'TableHead',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=colors.white
    )

    table_cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=11,
        textColor=c_navy
    )

    story = []

    # ── Cover / Header Banner ──
    banner_data = [
        [
            Paragraph(f"<b>UNIFLOW OPS v5.0</b> — OPERATIONAL SOP", ParagraphStyle('B1', fontName='Helvetica-Bold', fontSize=9, textColor=c_teal_light)),
            Paragraph(f"ROLE: <b>{role_name.upper()}</b>", ParagraphStyle('B2', fontName='Helvetica-Bold', fontSize=9, alignment=2, textColor=colors.HexColor("#CBD5E1")))
        ],
        [
            Paragraph(manual_title, title_style),
            ""
        ],
        [
            Paragraph(subtitle, subtitle_style),
            ""
        ]
    ]

    banner_table = Table(banner_data, colWidths=[400, 140])
    banner_table.setStyle(TableStyle([
        ('SPAN', (0, 1), (1, 1)),
        ('SPAN', (0, 2), (1, 2)),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#E2E8F0")),
        ('PADDING', (0, 0), (-1, -1), 12),
        ('BOTTOMPADDING', (0, 2), (-1, 2), 10),
    ]))
    story.append(banner_table)
    story.append(Spacer(1, 10))

    # Meta Info Card
    meta_data = [
        [
            Paragraph("<b>Target Audience:</b>", body_style),
            Paragraph(target_audience, body_style),
            Paragraph("<b>System Version:</b>", body_style),
            Paragraph("v5.0 Enterprise", body_style)
        ],
        [
            Paragraph("<b>Environment:</b>", body_style),
            Paragraph("Web App / Android Scanner / Tablet", body_style),
            Paragraph("<b>Published By:</b>", body_style),
            Paragraph("Innovus Manufacturing Systems", body_style)
        ]
    ]
    meta_table = Table(meta_data, colWidths=[95, 175, 95, 175])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#FFFFFF")),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#F1F5F9")),
        ('PADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 14))

    # ── Table of Contents Summary ──
    story.append(Paragraph("DOCUMENT OUTLINE & WORKFLOW SECTIONS", h2_style))
    toc_bullets = []
    for idx, sec in enumerate(sections, 1):
        toc_bullets.append([
            Paragraph(f"<b>§ {idx}.0</b>", ParagraphStyle('TOCNum', fontName='Helvetica-Bold', fontSize=8.5, textColor=c_teal)),
            Paragraph(f"<b>{sec['title']}</b> — {sec.get('desc', '')}", body_style)
        ])
    toc_table = Table(toc_bullets, colWidths=[40, 500])
    toc_table.setStyle(TableStyle([
        ('PADDING', (0, 0), (-1, -1), 3),
        ('LINEBELOW', (0, 0), (-1, -1), 0.5, colors.HexColor("#F1F5F9")),
    ]))
    story.append(toc_table)
    story.append(Spacer(1, 16))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#E2E8F0"), spaceAfter=14))

    # ── Section Content ──
    for sec_idx, sec in enumerate(sections, 1):
        story.append(Paragraph(f"§ {sec_idx}.0 {sec['title']}", h1_style))
        if 'intro' in sec and sec['intro']:
            story.append(Paragraph(sec['intro'], body_style))

        # Steps or Bullet points
        if 'points' in sec and sec['points']:
            for p in sec['points']:
                story.append(Paragraph(f"• {p}", bullet_style))
            story.append(Spacer(1, 6))

        # Tables if any
        if 'table' in sec and sec['table']:
            t_data = sec['table']['data']
            t_cols = sec['table'].get('colWidths', [120, 420])
            formatted_data = []
            for r_idx, row in enumerate(t_data):
                f_row = []
                for cell in row:
                    if r_idx == 0:
                        f_row.append(Paragraph(f"<b>{cell}</b>", table_header_style))
                    else:
                        f_row.append(Paragraph(cell, table_cell_style))
                formatted_data.append(f_row)
            
            flow_table = Table(formatted_data, colWidths=t_cols)
            flow_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), c_teal),
                ('PADDING', (0, 0), (-1, -1), 5),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
            ]))
            story.append(flow_table)
            story.append(Spacer(1, 8))

        # Callout note/warning if any
        if 'callout' in sec and sec['callout']:
            ctype = sec['callout'].get('type', 'tip')
            cbg = c_bg_warn if ctype == 'warn' else c_bg_callout
            cbdr = c_border_warn if ctype == 'warn' else c_border
            icon = "⚠️ IMPORTANT:" if ctype == 'warn' else "💡 PRO-TIP / SOP RULE:"
            callout_content = [
                [
                    Paragraph(f"<b>{icon}</b> {sec['callout']['text']}", callout_style)
                ]
            ]
            callout_table = Table(callout_content, colWidths=[540])
            callout_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), cbg),
                ('BOX', (0, 0), (-1, -1), 1, cbdr),
                ('PADDING', (0, 0), (-1, -1), 7),
            ]))
            story.append(callout_table)
            story.append(Spacer(1, 10))

    # Canvas Maker Wrapper to pass title to header
    class ConfiguredCanvas(NumberedCanvas):
        doc_manual_title = f"{role_name.upper()} MANUAL"

    doc.build(story, canvasmaker=ConfiguredCanvas)
    print(f"Generated: {pdf_path}")
    return pdf_path


# ─────────────────────────────────────────────────────────────────────────────
# 1. OPERATOR MANUAL CONTENT
# ─────────────────────────────────────────────────────────────────────────────
operator_sections = [
    {
        'title': 'System Access, Shift Login & Station Selection',
        'desc': 'Signing in, scanning device initialization, and line selection',
        'intro': 'Floor operators must ensure their barcode scanning hardware is operational and that they are clocked into the appropriate line and workstation.',
        'points': [
            '<b>Authentication:</b> Navigate to the UniFlow Ops portal. Enter your assigned operator username and password, then click <b>Login</b>.',
            '<b>Shift & Line Context:</b> Your assigned production line (e.g. Line 04) is automatically loaded from supervisor scheduling. If prompted, select your active shift.',
            '<b>Hardware Check:</b> Confirm the scanner pill displays <b>"Connected Product QR Scanner Ready"</b>. Both USB HID and Bluetooth wireless 2D QR scanners are supported.',
            '<b>Operator Progress Banner:</b> Every workstation features a <b>MY PROGRESS</b> card indicating units passed, failed, and percentage completed during the shift.'
        ],
        'callout': {
            'type': 'tip',
            'text': 'Always tap the scan input field or press any hardware scan trigger to ensure keyboard focus before beginning a production run.'
        }
    },
    {
        'title': 'Station 1: In-Line (Pre-QC) Workstation',
        'desc': 'Component validation & sub-assembly QR linking',
        'intro': 'The In-Line workstation ensures garment components (collars, cuffs, pockets, plackets) pass sub-assembly validation and are linked to the parent piece.',
        'points': [
            '<b>Active PO Verification:</b> Verify the active Production Order card at the top matches the style and garment currently being stitched on the line.',
            '<b>Scan Sub-Assembly Barcodes:</b> Scan each garment piece\'s QR code as it arrives at your sewing station.',
            '<b>Sub-Component Binding:</b> For multi-part styles, scan all linked sub-part QR codes in sequence before clearing the unit.',
            '<b>Pass / Fail Evaluation:</b> If stitching, fabric alignment, or measurements deviate from specifications, tag the defect reason and record as FAIL.'
        ],
        'table': {
            'data': [
                ['Action', 'System Reaction', 'Next Operator Step'],
                ['Scan Valid Sub-Part QR', 'Green beep, increments Pre-QC Passed count', 'Pass piece to next operator down the sewing line'],
                ['Scan Duplicate QR', 'Red warning buzzer: "Already Scanned in Pre-QC"', 'Verify physical garment tag; do not scan twice'],
                ['Defect Detected', 'Prompts defect tag checklist (e.g. Broken Stitch)', 'Record FAIL; send unit to rework bin']
            ],
            'colWidths': [130, 240, 170]
        }
    },
    {
        'title': 'Station 2: End-Line (QC Testing) Workstation',
        'desc': 'Finished garment quality audit & primary barcode scan',
        'intro': 'The End-Line workstation is the primary quality checkpoint before packing. Finished garments undergo comprehensive aesthetic and measurement audits.',
        'points': [
            '<b>Barcode Format Validation:</b> Scan the garment\'s primary QR barcode. The system verifies the code prefix, style definition, and sequential range.',
            '<b>Multi-Test Audit Verification:</b> Depending on style configuration, up to two tests are conducted (e.g., Aesthetic Inspection and Dimensional Tolerance). Both tests must pass.',
            '<b>Pass Logging:</b> Passed units increment the <b>QC Passed</b> counter and are immediately eligible for carton packing.',
            '<b>Defect & Scrap Routing:</b> Defective units can be assigned to <b>Rework</b> or tagged as <b>Scrapped</b> if irreparable. Scrapped garments are permanently logged.'
        ],
        'callout': {
            'type': 'warn',
            'text': 'Only garments that have successfully passed all required QC inspection tests can be scanned into shipping cartons.'
        }
    },
    {
        'title': 'Station 3: Carton Packing Workstation',
        'desc': 'Scanning QC-passed items into shipping cartons and auto-sealing',
        'intro': 'The Packing station groups passed garments into export carton boxes according to the PO packing ratio and capacity configuration.',
        'points': [
            '<b>Box Creation or Selection:</b> Tap <b>"Open New Carton"</b> or scan an existing open box barcode. Confirm target capacity (e.g., 24 pcs / carton).',
            '<b>Scanning Garments:</b> Scan individual garment QR barcodes directly into the active box. The live capacity gauge tracks fill progress (e.g., 18/24).',
            '<b>Duplicate & Status Guard:</b> The system rejects items that have not passed QC or are already packed into another carton.',
            '<b>Auto-Seal & Label Generation:</b> When capacity reaches 100%, the box automatically transitions to <b>SEALED</b> status and enters the AQL queue.',
            '<b>Box Number Editing:</b> If a physical carton label changes, operators or admins can update the identifier via the edit dialog.'
        ],
        'table': {
            'data': [
                ['Box Status', 'Meaning', 'Allowed Operations'],
                ['OPEN', 'Actively accepting garments', 'Scan item QRs into box; remove mis-packed QRs'],
                ['SEALED', 'Target capacity reached', 'Ready for AQL inspection; garments locked'],
                ['AQL_PASSED', 'Inspected and certified by AQL', 'Eligible for Box Transfer to shipping warehouse'],
                ['AQL_FAILED', 'Failed AQL sample audit', 'Must be unsealed and re-audited according to QA policy']
            ],
            'colWidths': [100, 230, 210]
        }
    },
    {
        'title': 'Station 4: Normal AQL & Final AQL Inspections',
        'desc': 'Quality assurance audits on sealed carton boxes',
        'intro': 'AQL (Acceptable Quality Level) inspectors audit randomly selected sealed boxes prior to final warehouse transfer.',
        'points': [
            '<b>Step 1 — Box Scan:</b> Scan the sealed carton barcode to inspect its metadata, PO association, and item list.',
            '<b>Step 2 — Sample Extraction:</b> The system calculates the mandatory sample size based on carton capacity (e.g., 5 sample units from a 24-piece box).',
            '<b>Step 3 — Item Audit:</b> Inspect each selected sample piece. Validate stitch integrity, labeling, barcodes, and cleanliness.',
            '<b>Step 4 — Result Certification:</b> Mark the audit as <b>PASS</b> or <b>FAIL</b>. Passing records the inspector\'s badge and qualifies the box for Box Transfer.'
        ]
    },
    {
        'title': 'Station 5: Box Transfer Station',
        'desc': 'Transferring completed cartons to shipping & warehouse',
        'intro': 'The final floor step moves certified boxes from the production floor to the warehouse shipping staging area.',
        'points': [
            '<b>Scan Sealed & Passed Boxes:</b> Scan the carton barcode at the transfer gate.',
            '<b>Location Assignment:</b> Select or scan the destination shipping rack or pallet identifier.',
            '<b>Transfer Confirmation:</b> Confirm the batch transfer. The live PO dashboard updates with warehouse-ready metrics.'
        ]
    }
]

# ─────────────────────────────────────────────────────────────────────────────
# 2. SUPERVISOR MANUAL CONTENT
# ─────────────────────────────────────────────────────────────────────────────
supervisor_sections = [
    {
        'title': 'Plant Association & Supervisor Responsibilities',
        'desc': 'Role scope, single-plant data isolation, and governance',
        'intro': 'Supervisors oversee floor production, line balancing, and quality compliance for their designated plant facility.',
        'points': [
            '<b>Plant Scoping:</b> Supervisors have full visibility and administrative rights over their assigned plant facility (e.g. Plant 1). Data from external plants is automatically filtered.',
            '<b>Order Authority:</b> Supervisors can create and edit Production Orders (POs) and Sales Orders (SOs) directly for their facility.',
            '<b>Line Responsibilities:</b> Monitor operator throughput, active line balances, bottleneck stages, and hourly target pacing.'
        ],
        'callout': {
            'type': 'tip',
            'text': 'Supervisors can view real-time floor metrics on both mobile tablets and desktop monitors via the responsive supervisor dashboard.'
        }
    },
    {
        'title': 'Production Order (PO) & Sales Order (SO) Management',
        'desc': 'Step-by-step guide to creating and scheduling production orders',
        'intro': 'Supervisors initiate production orders that drive floor scanning workflows across all stations.',
        'points': [
            '<b>Step 1 — Style Selection:</b> Navigate to <b>Orders ➔ Create PO</b>. Select the target customer (e.g. Beacon Medical, BioTab) and garment style.',
            '<b>Step 2 — General Parameters:</b> Input the PO Number, Total Planned Quantity, Due Date, and target Production Line.',
            '<b>Step 3 — Sales Orders (SOs):</b> Add sub-allocations or Sales Order lines specifying destination branches, colorways, or delivery schedules.',
            '<b>Step 4 — Review & Activation:</b> Confirm order configurations. Once created, the PO immediately appears on operator workstations for floor scanning.'
        ],
        'table': {
            'data': [
                ['Field', 'Description', 'Validation Rule'],
                ['PO Number', 'Unique manufacturing order identifier', 'Must be unique across active plant orders'],
                ['Total QTY', 'Contractual production quantity', 'Positive integer; drives progress percentage'],
                ['Due Date', 'Contractual delivery date to customer', 'Generates countdown badge & overdue alerts'],
                ['Assigned Line', 'Factory production line (e.g. Line 04)', 'Directs live scanning queues to assigned operators']
            ],
            'colWidths': [110, 230, 200]
        }
    },
    {
        'title': 'Shift Management & Operator Allocations',
        'desc': 'Scheduling operator shifts and managing workstation allocations',
        'intro': 'Maintain efficient line productivity by creating shifts and dynamically assigning operators to stations.',
        'points': [
            '<b>Shift Creation:</b> Navigate to <b>Shift Management</b>. Define shift names (e.g., Morning Shift A, Night Shift B), start times, and supervisors in charge.',
            '<b>Line Allocations:</b> Assign specific operators to designated production lines and workstations (Inline, Endline, Packing, AQL).',
            '<b>Real-Time Re-Allocation:</b> Re-balance lines in real time by shifting available operators to bottleneck stations during volume surges.'
        ]
    },
    {
        'title': 'Floor Monitoring & Production Stage Overviews',
        'desc': 'Interpreting live metrics: Pre-QC, QC, Packing, AQL, and Scrap',
        'intro': 'The Supervisor Home dashboard provides consolidated visibility across all operational floor stages.',
        'points': [
            '<b>Active PO Overview:</b> Displays current active PO details, due date countdowns, and total progress percentage.',
            '<b>Stage Progress Metrics:</b> Monitor live Passed/Failed counts across all 5 operational steps in real time:',
            '  — <b>Pre-QC (Inline):</b> Component sub-assembly throughput.',
            '  — <b>QC Test (Endline):</b> Garment primary inspection results.',
            '  — <b>Packing:</b> Packed garments vs. remaining loose units and active open cartons.',
            '  — <b>Normal AQL & Final AQL:</b> Sample audit acceptance rates.',
            '  — <b>Transfers & Scrap:</b> Warehouse transfers completed and scrap counts.'
        ],
        'callout': {
            'type': 'warn',
            'text': 'If the failure rate on QC Test exceeds 3%, immediately conduct a root-cause investigation at the corresponding sewing line.'
        }
    },
    {
        'title': 'Quality Audits, Box Editing & Exception Handling',
        'desc': 'Resolving barcode issues, damaged cartons, and sample failures',
        'intro': 'Supervisors hold authorization to manage operational exceptions and audit corrections.',
        'points': [
            '<b>Editing Carton Numbers:</b> If a carton barcode becomes illegible or requires renumbering, click <b>Edit Box</b> in the Packing modal to update the identifier.',
            '<b>Unpacking Mis-Scanned Items:</b> If an item was incorrectly packed into a carton, supervisors can click the red remove icon in the box content viewer to release the unit.',
            '<b>AQL Failure Escalation:</b> If an AQL audit fails, quarantine the box, investigate the sample defects, and notify quality control.'
        ]
    }
]

# ─────────────────────────────────────────────────────────────────────────────
# 3. ADMINISTRATOR MANUAL CONTENT
# ─────────────────────────────────────────────────────────────────────────────
admin_sections = [
    {
        'title': 'System Architecture, Security & Role-Based Access (RBAC)',
        'desc': 'Core infrastructure, user permissions, and security hierarchy',
        'intro': 'UniFlow Ops v5.0 features enterprise-grade role-based access control, relational database persistence, and multi-facility isolation.',
        'points': [
            '<b>Security Hierarchy:</b> Three distinct permission tiers exist: <b>Operator</b> (restricted to assigned workstation scanning), <b>Supervisor</b> (plant-scoped order & shift management), and <b>Administrator</b> (global system oversight).',
            '<b>Session Management:</b> High-security JWT authentication with automatic invalidation of stale operator sessions.',
            '<b>Multi-Plant Isolation:</b> Supports multi-facility enterprises with independent plant scopes and centralized administrative governance.'
        ],
        'table': {
            'data': [
                ['Permission Capability', 'Operator', 'Supervisor', 'Administrator'],
                ['Scan & Execute Station Workflows', 'YES', 'YES', 'YES'],
                ['Create & Edit POs / SOs', 'NO', 'YES (Own Plant)', 'YES (All Plants)'],
                ['Manage Shifts & Assign Operators', 'NO', 'YES', 'YES'],
                ['Create Users & Reset Passwords', 'NO', 'NO', 'YES'],
                ['Create & Manage Plant Facilities', 'NO', 'NO', 'YES'],
                ['Export All Merged Audit CSVs', 'NO', 'NO', 'YES']
            ],
            'colWidths': [180, 110, 120, 130]
        }
    },
    {
        'title': 'User Management & Plant Facilities (AdminUsers)',
        'desc': 'Provisioning user accounts, roles, shifts, and factory plants',
        'intro': 'Administrators configure human resources and production plant facilities via the centralized Admin Users console.',
        'points': [
            '<b>Add New User:</b> Click <b>Add New User</b>. Provide full name, username, initial password, system role, and assigned plant facility.',
            '<b>Manage Group:</b> Manage operational teams, assign supervisor leads, and coordinate shift rotations.',
            '<b>Create Plants:</b> Use the dedicated <b>Create Plants</b> modal to provision new factory facilities, branch locations, and warehouse buildings.',
            '<b>Account Lifecycle:</b> Toggle accounts between <b>Active</b> and <b>Inactive</b>, or permanently delete decommissioned credentials.'
        ],
        'callout': {
            'type': 'tip',
            'text': 'Deactivating an account immediately revokes all active session tokens, ensuring instant termination of floor access.'
        }
    },
    {
        'title': 'Active Sessions & Security Oversight (AdminSessions)',
        'desc': 'Monitoring active logins, station heartbeats, and device security',
        'intro': 'Track active operator sessions across all plant lines to ensure terminal integrity and prevent unauthorized concurrency.',
        'points': [
            '<b>Live Session Monitor:</b> View all active logins with username, workstation, production line, IP/device signature, and login timestamp.',
            '<b>Heartbeat Tracking:</b> Devices transmit background heartbeats every 60 seconds. Inactive terminals are flagged as idle.',
            '<b>Forced Termination:</b> Administrators can terminate any session remotely in the event of hardware loss or suspected credential compromise.'
        ]
    },
    {
        'title': 'Executive Reports, Deep Inspection & Merged CSV Exports',
        'desc': 'Step 1 Cascade Selector, 7 inspection tabs, and comprehensive audit downloads',
        'intro': 'The Admin Reports console is the central audit intelligence engine for production tracking, customer traceability, and quality analytics.',
        'points': [
            '<b>Step 1 — Order Cascade Selector:</b> Drill down hierarchically: <b>Customer ➔ Style Name ➔ PO ➔ SO ➔ Line</b> to isolate specific production batches.',
            '<b>7 Dedicated Deep Inspection Tabs:</b> Access specialized logs with instant mobile-friendly horizontal swipe navigation:',
            '  • <b>Pre-QC (Inline):</b> Every scanned sub-assembly QR and linked garment record.',
            '  • <b>QC Details (Endline):</b> Primary garment inspections, pass/fail status, and multi-test sub-results.',
            '  • <b>Carton Packing:</b> Every packed carton box, active fill count, capacity, and packed garment QR list.',
            '  • <b>Normal AQL & Final AQL:</b> Sample audit records, inspector timestamps, and pass/fail certificates.',
            '  • <b>Box Transfers:</b> Pallet and warehouse shipping handoff logs.',
            '  • <b>Scrap Records:</b> Permanent audit trails for discarded and damaged garments.',
            '<b>All Merged CSV Export:</b> Generates a complete end-to-end audit file connecting every individual garment QR to its Pre-QC components, Endline QC result, carton box number, AQL status, and final warehouse transfer.'
        ],
        'callout': {
            'type': 'warn',
            'text': 'The All Merged CSV Export is compliant with major retail customer audit requirements (e.g. Walmart, Target, Nike, Beacon Medical).'
        }
    },
    {
        'title': 'Database Maintenance, Backups & System Troubleshooting',
        'desc': 'Database migrations, backup schedules, and platform recovery',
        'intro': 'Best practices for IT teams maintaining the UniFlow Ops server and database infrastructure.',
        'points': [
            '<b>Relational Database Migrations:</b> Schema changes are version-controlled via database migration scripts (<code>npm run migrate</code>).',
            '<b>Automated Backup Schedules:</b> Implement daily automated database dumps. UniFlow Ops supports transactional MySQL and SQLite engines.',
            '<b>Network & Scanner Diagnostics:</b> Verify that local floor Wi-Fi access points provide stable latency under 150ms for seamless scanner throughput.'
        ]
    }
]

if __name__ == '__main__':
    out_dir = os.path.dirname(os.path.abspath(__file__))
    print(f"Generating manuals in: {out_dir}")

    build_manual(
        filename="UniFlow_Ops_Operator_Manual.pdf",
        manual_title="Operator User Manual",
        role_name="Operator",
        subtitle="Standard Operating Procedure for In-Line, End-Line, Packing & Quality Scanning",
        target_audience="Sewing Line Operators, In-Line Pre-QC Staff, End-Line QC Inspectors, Packing Staff",
        sections=operator_sections
    )

    build_manual(
        filename="UniFlow_Ops_Supervisor_Manual.pdf",
        manual_title="Supervisor User Manual",
        role_name="Supervisor",
        subtitle="Floor Operations, Production Order Creation, Shift Scheduling & Quality Oversight",
        target_audience="Production Supervisors, Line Chiefs, Shift Managers, Quality Assurance Leads",
        sections=supervisor_sections
    )

    build_manual(
        filename="UniFlow_Ops_Admin_Manual.pdf",
        manual_title="Administrator User Manual",
        role_name="Administrator",
        subtitle="System Architecture, User Governance, Executive Reporting & Audit Intelligence",
        target_audience="Plant General Managers, IT Administrators, Operations Directors, Compliance Auditors",
        sections=admin_sections
    )

    print("All 3 manuals generated successfully!")
