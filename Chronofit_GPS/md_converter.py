import pypandoc

pypandoc.convert_file(
    "API.md",
    "pdf",
    outputfile="API.pdf"
)

pypandoc.convert_file(
    "API_public.md",
    "pdf",
    outputfile="API_public.pdf"
)