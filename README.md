# UPI Credit Extractor

# Universal Indian Bank Statement Intelligence Engine

Build a production-ready Universal Indian Bank Statement Intelligence Engine.

The objective is to extract ONLY UPI Credit transactions from ORIGINAL Indian bank statements downloaded directly from banks.

This system must work automatically without requiring users to select bank names, templates or statement types.

----------------------------------------------------

PRIMARY OBJECTIVE

----------------------------------------------------

User uploads a bank statement.

The system automatically extracts every valid UPI Credit transaction.

The system returns only:

| Date | UTR | Amount | Mode |

Example

| Date | UTR | Amount | Mode |

|------|------|--------|------|

|12/12/2025|426272626736|324.00|UPI|

Nothing else should be returned.

----------------------------------------------------

SUPPORTED FILES

----------------------------------------------------

Support:

• PDF (Original Bank PDF only)

• XLS

• XLSX

• CSV

No OCR is required.

No image conversion is required.

No scanned PDF support is required.

The PDF will always be the original downloadable statement from the bank.

----------------------------------------------------

PDF PROCESSING

----------------------------------------------------

Use a proper PDF text extraction library.

Do NOT convert PDF into images.

Do NOT use OCR.

Preserve the original transaction table structure.

Preserve rows.

Preserve columns.

The parser depends on row structure.

Never flatten the PDF into one long text.

Every transaction must remain one transaction row.

If the PDF cannot be parsed,

show an appropriate error message.

----------------------------------------------------

GENERAL REQUIREMENT

----------------------------------------------------

Every Indian bank has a different statement format.

Different banks use different

• headers

• layouts

• narration styles

• amount columns

• balance columns

• credit columns

• debit columns

Never create separate parsers for each bank.

Build one universal parser.

----------------------------------------------------

DO NOT DEPEND ON

----------------------------------------------------

Do not depend on

• Bank Name

• Column Position

• Column Order

• Fixed Headers

• Fixed Narration

• Statement Template

The parser must automatically understand every statement layout.

----------------------------------------------------

PROCESS FLOW

----------------------------------------------------

Upload Statement

↓

Read File

↓

Detect Transaction Table

↓

Detect Transaction Rows

↓

Process Every Row Independently

↓

Identify UPI Credit Transactions

↓

Extract

Date

UTR

Amount

↓

Display Results

↓

Allow CSV Download

----------------------------------------------------

TRANSACTION ROW DETECTION

----------------------------------------------------

Ignore

Opening Balance

Closing Balance

Header

Footer

Customer Details

Account Details

Nominee

Branch

IFSC

MICR

Summary

Only transaction rows should be processed.

Every row must be processed independently.

Never combine two rows.

----------------------------------------------------

UPI DETECTION

----------------------------------------------------

A row becomes a UPI candidate only if

UPI

exists anywhere inside that row.

Supported examples

UPI

UPI/

UPI-

UPI:

UPI PAYMENT

UPI PAY

UPI COLLECT

UPI P2A

UPI P2M

UPI QR

Ignore upper/lower case.

----------------------------------------------------

UTR DETECTION

----------------------------------------------------

Search only inside the same transaction row.

Find every valid 12-digit numeric value.

Choose the 12-digit value associated with the UPI transaction.

Ignore every other narration word.

Ignore

Customer Name

Bank Name

Merchant Name

UPI ID

VPA

PAYMENT

PAYMT

YESB

SBIN

HDFC

ICIC

KKBK

etc.

Only extract the valid 12-digit UPI Reference.

----------------------------------------------------

DATE DETECTION

----------------------------------------------------

Extract transaction date.

Support

DD-MM-YYYY

DD/MM/YYYY

YYYY-MM-DD

DD Mon YYYY

DD-MMM-YYYY

If both Transaction Date and Value Date exist,

always use Transaction Date.

----------------------------------------------------

AMOUNT DETECTION

----------------------------------------------------

Extract ONLY transaction amount.

Never extract

Balance

Opening Balance

Closing Balance

Available Balance

----------------------------------------------------

CREDIT DETECTION

----------------------------------------------------

Accept any of the following as Credit

CR

Cr

Credit

Credit Amount

Deposit

Received

Incoming

Credit Value

CR Amount

CR/DR where row value is CR

Amount present in Credit column

Narration contains CR

Ignore Debit transactions

Examples

DR

Dr

Debit

Withdrawal

Sent

Paid

Outgoing

Debit Amount

Amount present in Debit column

Narration contains DR

----------------------------------------------------

VALIDATION

----------------------------------------------------

Accept a row ONLY if

Date exists

AND

UPI exists

AND

Valid 12-digit UTR exists

AND

Transaction Amount exists

AND

Transaction is Credit

Otherwise ignore the row.

----------------------------------------------------

OUTPUT

----------------------------------------------------

Display

| Date | UTR | Amount | Mode |

Mode should always be

UPI

Do not display

Narration

Balance

Customer Name

Account Number

Branch

IFSC

MICR

Extra columns

----------------------------------------------------

CSV EXPORT

----------------------------------------------------

Provide a working CSV Download button.

Export every displayed row.

CSV Columns

Date

UTR

Amount

Mode

Example

Date,UTR,Amount,Mode

12/12/2025,426272626736,324.00,UPI

Requirements

• Export every displayed transaction.

• Preserve row order.

• UTF-8 encoding.

• Compatible with Excel.

• Compatible with Google Sheets.

• Compatible with LibreOffice.

• No blank rows.

• No duplicate rows.

Filename

UPI_Credits_YYYYMMDD_HHMMSS.csv

----------------------------------------------------

ERROR HANDLING

----------------------------------------------------

If no UPI Credit transaction exists

show

"No UPI Credit transactions found."

If PDF parsing fails

show

"Unable to read this bank statement."

Never silently fail.

----------------------------------------------------

IMPORTANT

----------------------------------------------------

Do NOT build bank-specific parsers.

Do NOT hardcode any bank.

Do NOT hardcode any column positions.

Do NOT hardcode any narration format.

The parser must automatically adapt to different Indian bank statement layouts.

The parser must process transaction rows intelligently.

----------------------------------------------------

TECHNICAL REQUIREMENTS

----------------------------------------------------

The code must be

• Modular

• Maintainable

• Reusable

• Scalable

• Production Ready

• Easily Extendable

Future modules such as IMPS, NEFT, RTGS and other transaction types should be addable without changing the core parser architecture.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://smart-upi-parser.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f6795f04-ee4c-435c-94bd-dc5d474c0d8f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
