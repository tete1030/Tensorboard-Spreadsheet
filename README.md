# Tensorboard Spreadsheet Helper

A tampermonkey script. Show your experiment log from Spreadsheet in Tensorboard.

## Log in Spreadsheet

![Spreadsheet](images/sheet.jpg)

## Tensorboard

![Tensorboard](images/tensorboard.jpg)

# Usage

1. Obtain credentials of your Google Spreadsheet account from the Google API Console: https://developers.google.com/identity/protocols/OAuth2
    - Pay attention to the domain and port you are using for Tensorboard. For me I'm using `localhost` and `8889`, so I should add one item to *Authorized JavaScript origins* with `http://localhost:8889`. If you have multiple Tensorboard opened, simply add all origins.
2. Copy code from `spreadsheet.js` to a new tampermonkey script
3. Fill your client id, Spreadsheet id and sheet name in script
4. Replace domain and port in the line starting with `// @match`. If you have multiple ones, simply add a new line start with `// @match`.
5. Customize anything. If you want to change the form of your sheet, change the lines begining with comment *CUSTOMIZE HERE IF YOU WANT TO CHANGE SHEET FORM*
