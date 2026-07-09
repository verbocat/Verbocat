import fitz
import inspect

try:
    print(inspect.getsource(fitz.Page.insert_htmlbox))
except Exception as e:
    print("Error:", e)
    # If source is not available, print docstring
    print(fitz.Page.insert_htmlbox.__doc__)
