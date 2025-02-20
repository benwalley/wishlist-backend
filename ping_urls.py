#!/usr/bin/env python3
import csv
import time
import urllib.request
import urllib.error
import concurrent.futures

class HeadRequest(urllib.request.Request):
    """A subclass that forces the HTTP method to HEAD."""
    def get_method(self):
        return "HEAD"

def check_url(url):
    """
    Checks the given URL using a HEAD request and returns a dictionary with:
      - URL
      - Whether it is a 404 (True/False)
      - The HTTP status code (if available)
      - The response time (in seconds)
      - Any error encountered (empty string if none)
    """
    start = time.time()
    details = {
        "url": url,
        "is_404": False,
        "status_code": None,
        "response_time": None,
        "error": ""
    }
    try:
        req = HeadRequest(url)
        # The timeout is set to 5 seconds (adjust as needed)
        with urllib.request.urlopen(req, timeout=5) as response:
            status_code = response.getcode()
            details["status_code"] = status_code
            details["is_404"] = (status_code == 404)
    except urllib.error.HTTPError as e:
        # HTTPError contains a valid HTTP status code
        details["status_code"] = e.code
        details["is_404"] = (e.code == 404)
        details["error"] = str(e)
    except Exception as e:
        details["error"] = str(e)
    details["response_time"] = round(time.time() - start, 3)
    return details

def main():
    input_csv = 'input_urls.csv'         # Input CSV file (one URL per row)
    output_csv = 'no_html_results.csv'   # Output CSV file with results
    urls = []

    # Read URLs from the input CSV.
    with open(input_csv, newline='', encoding='utf-8') as csvfile:
        reader = csv.reader(csvfile)
        for row in reader:
            if row:  # skip empty rows
                urls.append(row[0].strip())

    results = []
    # Use a thread pool to check URLs concurrently.
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        future_to_url = {executor.submit(check_url, url): url for url in urls}
        for future in concurrent.futures.as_completed(future_to_url):
            try:
                result = future.result()
                results.append(result)
            except Exception as exc:
                url = future_to_url[future]
                print(f"Error checking {url}: {exc}")

    # Write the results to the output CSV.
    with open(output_csv, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(["URL", "Is 404", "Status Code", "Response Time", "Error"])
        for r in results:
            writer.writerow([
                r["url"],
                r["is_404"],
                r["status_code"],
                r["response_time"],
                r["error"]
            ])

    print(f"Results written to {output_csv}")

if __name__ == '__main__':
    main()
