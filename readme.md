# Steam Market Item_NameIDs Fetcher
This repo is to fetch the Item_NameIDs of steam items, specifically for tf2 and cs2.
This is only used for my google spreadsheet but you can use it for whatever.

THIS REPO USES Node.js only so please use it in order to avoid any errors
[Google Docs](https://docs.google.com/spreadsheets/d/1kpfpMxstHFHJWa32YYHnnsiN91yNcoeiTtkPHWI8k2Y/edit?gid=1315717706#gid=1315717706)
# Table Of Contents

 - [Installation](#installation)
 - [Usage](#usage)
 - [License](#license)

# Installation
Install these dependencies to make the script function.

```shell
npm install puppeteer
```

```shell
npm install localtunnel
```

# Usage
to start up the script you'll need to do a couple things
1. Download and Extract the folder into your desktop for easy access
2. right click on an empty space inside the folder and open a command prompt or terminal
3. Type
   ```shell
   npm start
   ```
5. copy the link and paste it into your browser to ensure that it works.
6. then paste the url into the google apps script that is in the Google spreadsheet

To close the port you can do 2 things:
For linux:
```shell
sudo lsof -i :3000
```
then after you find the PID
```shell
sudo kill 12345
```
or if you want to do it way faster
in the terminal press CTRL + C on your keyboard, it will close the script :)

then for windows (I haven't tested it on windows yet so I might be wrong)
```shell
netstat -ano
```
after you find the PID
```shell
netstat -ano | findstr :<yourPortNumber>
taskkill /PID <typeyourPIDhere> /F
```
