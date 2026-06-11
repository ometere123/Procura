param([string]$BaseUrl = "http://localhost:3100", [string]$RfpId = "rfp_mq99j2w1_134a90")

$routes = @(
    "/",
    "/rfps",
    "/create-rfp",
    "/rfps/$RfpId",
    "/rfps/$RfpId/submit-bid",
    "/rfps/$RfpId/bids/bid_fake",
    "/rfps/$RfpId/bids/bid_fake/evidence",
    "/rfps/$RfpId/bids/bid_fake/clarification",
    "/rfps/$RfpId/bids/bid_fake/appeal"
)

$results = @()
foreach ($r in $routes) {
    $url = $BaseUrl + $r
    try {
        $resp = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 90
        $status = $resp.StatusCode
        $len = $resp.Content.Length
        $bad500 = if ($resp.Content -match "Internal Server Error|Application error|Jest worker") { " ⚠ 500-ish text in body" } else { "" }
        Write-Host ("{0}`t{1} bytes`t{2}{3}" -f $status, $len, $r, $bad500)
    } catch {
        $status = if ($_.Exception.Response) { $_.Exception.Response.StatusCode.value__ } else { "ERR" }
        $msg = $_.Exception.Message -replace "`r?`n", " "
        Write-Host ("{0}`tERR`t{1}`t{2}" -f $status, $r, $msg)
    }
}
