#!/usr/bin/env python3
import json
import urllib.request

def get_search_analytics_data(access_token, site_url, start_date, end_date):
    endpoint = f"https://www.googleapis.com/webmasters/v3/sites/{site_url}/searchAnalytics/query"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    payload = {
        "startDate": start_date,
        "endDate": end_date,
        "dimensions": ["page"],
        "rowLimit": 5000
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(endpoint, data=data, headers=headers)

    try:
        with urllib.request.urlopen(req) as response:
            response_data = response.read()
            return json.loads(response_data.decode("utf-8"))
    except Exception as e:
        print("Error fetching data:", e)
        return None

if __name__ == "__main__":
    # Replace with your actual access token and site URL (URL-encoded, if necessary)
    access_token = "YOUR_ACCESS_TOKEN"
    site_url = "https://www.waymotorworis.com/"  # Must be the verified property URL in Search Console
    start_date = "2024-01-01"
    end_date = "2024-01-31"

    result = get_search_analytics_data(access_token, site_url, start_date, end_date)
    if result:
        # The returned result will contain a "rows" key if data is available.
        for row in result.get("rows", []):
            page = row.get("keys", [])[0]  # Because we queried by "page"
            impressions = row.get("impressions", 0)
            clicks = row.get("clicks", 0)
            print(f"Page: {page}, Impressions: {impressions}, Clicks: {clicks}")
