# ShareX upload-token migration

OpenCloud now accepts an upload token only in the `x-opencloud-upload-token` request header. Remove the old `uploadToken` multipart field from each ShareX custom uploader.

Update the uploader with these values:

- Method: `POST`
- Request URL: `https://api.example.com/v1/files`
- Header: `x-opencloud-upload-token: YOUR_UPLOAD_TOKEN`
- Body: `MultipartFormData`
- File form name: `file`
- Result URL: `https://cloud.example.com/file/{json:id}{json:fileExtension}`
- Error message: `{json:message}`

Replace both example hosts and `YOUR_UPLOAD_TOKEN` with the values for your OpenCloud deployment. ShareX documents headers, multipart bodies, file form names, and JSON response parsing in its [custom uploader guide](https://getsharex.com/docs/custom-uploader.html).

The equivalent `.sxcu` shape is:

```json
{
    "Version": "17.0.0",
    "Name": "OpenCloud",
    "DestinationType": "ImageUploader, FileUploader",
    "RequestMethod": "POST",
    "RequestURL": "https://api.example.com/v1/files",
    "Headers": {
        "x-opencloud-upload-token": "YOUR_UPLOAD_TOKEN"
    },
    "Body": "MultipartFormData",
    "FileFormName": "file",
    "URL": "https://cloud.example.com/file/{json:id}{json:fileExtension}",
    "ErrorMessage": "{json:message}"
}
```
