import { Modal, Setting, TFile, ButtonComponent, Notice } from "obsidian";
import * as electron from "electron";
import BetterExportPdfPlugin from "./main";
import { renderMarkdown, getAllStyles, createWebview } from "./render";
import { exportToPDF, getOutputFile } from "./pdf";

type PageSizeType = electron.PrintToPDFOptions["pageSize"];

export interface TConfig {
  pageSise: PageSizeType;
  marginType: string;
  open: boolean;
  landscape: boolean;
  scale: number;
  showTitle: boolean;
  displayHeaderFooter: boolean;

  marginTop?: string;
  marginBottom?: string;
  marginLeft?: string;
  marginRight?: string;
}

type Callback = (conf: TConfig) => void;

function fullWidthButton(button: ButtonComponent) {
  button.buttonEl.setAttribute("style", `margin: "0 auto"; width: -webkit-fill-available`);
}

function setInputWidth(inputEl: HTMLInputElement) {
  inputEl.setAttribute("style", `width: 100px;`);
}

export class ExportConfigModal extends Modal {
  config: TConfig;
  canceled: boolean;
  callback: Callback;
  plugin: BetterExportPdfPlugin;
  file: TFile;
  preview: electron.WebviewTag;
  completed: boolean;
  doc: Document;

  constructor(plugin: BetterExportPdfPlugin, file: TFile, callback: Callback, config?: TConfig) {
    super(plugin.app);
    this.canceled = true;
    this.plugin = plugin;
    this.file = file;
    this.completed = false;
    this.config = {
      pageSise: "A4",
      marginType: "1",
      showTitle: true,
      open: true,
      scale: 100,
      landscape: false,
      marginTop: "10",
      marginBottom: "10",
      marginLeft: "10",
      marginRight: "10",

      ...(plugin.settings?.prevConfig ?? {}),
    } as TConfig;
    this.callback = callback;
  }

  async onOpen() {
    this.contentEl.empty();
    this.containerEl.style.setProperty("--dialog-width", "60vw");

    this.titleEl.setText("Export to PDF");
    const wrapper = this.contentEl.createDiv();
    wrapper.setAttribute("style", "display: flex; flex-direction: row; height: 75vh;");

    const appendWebview = async (e: HTMLDivElement) => {
      this.doc = await renderMarkdown(this.plugin, this.file, this.config);
      const webview = createWebview();
      this.preview = e.appendChild(webview);
      this.preview.addEventListener("dom-ready", async (e) => {
        this.completed = true;
        getAllStyles().forEach(async (css) => {
          await this.preview.insertCSS(css);
        });
        await this.preview.executeJavaScript(`
        document.title = \`${this.file.basename}\`;
        document.body.innerHTML = decodeURIComponent(\`${encodeURIComponent(this.doc.body.innerHTML)}\`);
				
        document.body.setAttribute("class", \`${document.body.getAttribute("class")}\`)
        document.body.setAttribute("style", \`${document.body.getAttribute("style")}\`)
        document.body.addClass("theme-light");
        document.body.removeClass("theme-dark");
        `);
      });
    };

    const previewDiv = wrapper.createDiv({ attr: { style: "flex:auto;" } }, async (e) => {
      e.empty();
      await appendWebview(e);
    });

    const contentEl = wrapper.createDiv();
    contentEl.setAttribute("style", "width:320px;margin-left:16px;");

    this.generateForm(contentEl);

    const handleExport = async () => {
      this.plugin.settings.prevConfig = this.config;
      await this.plugin.saveSettings();

      if (this.completed) {
        const outputFile = await getOutputFile(this.file);
        if (outputFile) {
          await exportToPDF(outputFile, { ...this.plugin.settings, ...this.config }, this.preview, this.doc);
          this.close();
        }
      } else {
        new Notice("dom not ready");
      }
    };

    new Setting(contentEl).setHeading().addButton((button) => {
      button.setButtonText("Export").onClick(handleExport);

      fullWidthButton(button);
    });

    new Setting(contentEl).setHeading().addButton((button) => {
      button.setButtonText("Refresh").onClick(async () => {
        previewDiv.empty();
        await appendWebview(previewDiv);
      });
      fullWidthButton(button);
    });

    const debugEl = new Setting(contentEl).setHeading().addButton((button) => {
      button.setButtonText("Debug").onClick(async () => {
        this.preview?.openDevTools();
      });
      fullWidthButton(button);
    });
    debugEl.settingEl.hidden = !this.plugin.settings.debug;
  }

  private generateForm(contentEl: HTMLDivElement) {
    new Setting(contentEl).setName("Add filename as title").addToggle((toggle) =>
      toggle
        .setTooltip("Add filename as title")
        .setValue(this.config["showTitle"])
        .onChange(async (value) => {
          this.config["showTitle"] = value;

          if (this.completed) {
            this.doc = await renderMarkdown(this.plugin, this.file, this.config);
            this.preview?.executeJavaScript(`
            document.body.innerHTML = decodeURIComponent(\`${encodeURIComponent(this.doc.body.innerHTML)}\`);
            `);
          }
        }),
    );
    const pageSizes: PageSizeType[] = [
      "A0",
      "A1",
      "A2",
      "A3",
      "A4",
      "A5",
      "A6",
      "Legal",
      "Letter",
      "Tabloid",
      "Ledger",
    ];
    new Setting(contentEl).setName("Page size").addDropdown((dropdown) => {
      dropdown
        .addOptions(Object.fromEntries(pageSizes.map((size) => [size, size])))
        .setValue(this.config.pageSise as string)
        .onChange(async (value: string) => {
          this.config["pageSise"] = value as PageSizeType;
        });
    });

    new Setting(contentEl)
      .setName("Margin")
      .setDesc("The unit is millimeters.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("0", "None")
          .addOption("1", "Default")
          .addOption("2", "Small")
          .addOption("3", "Custom")
          .setValue(this.config["marginType"])
          .onChange(async (value: string) => {
            this.config["marginType"] = value;
            if (value == "3") {
              topEl.settingEl.hidden = false;
              btmEl.settingEl.hidden = false;
            } else {
              topEl.settingEl.hidden = true;
              btmEl.settingEl.hidden = true;
            }
          });
      });

    const topEl = new Setting(contentEl)
      .setName("Top/Bottom")
      .addText((text) => {
				setInputWidth(text.inputEl)
        text
          .setPlaceholder("margin top")
          .setValue(this.config["marginTop"] as string)
          .onChange((value) => {
            this.config["marginTop"] = value;
          });
      })
      .addText((text) => {
				setInputWidth(text.inputEl)
        text
          .setPlaceholder("margin bottom")
          .setValue(this.config["marginBottom"] as string)
          .onChange((value) => {
            this.config["marginBottom"] = value;
          });
      });
    topEl.settingEl.hidden = this.config["marginType"] != "3";
    const btmEl = new Setting(contentEl)
      .setName("Left/Right")
      .addText((text) => {
				setInputWidth(text.inputEl)
        text
          .setPlaceholder("margin left")
          .setValue(this.config["marginLeft"] as string)
          .onChange((value) => {
            this.config["marginLeft"] = value;
          });
      })
      .addText((text) => {
				setInputWidth(text.inputEl)
        text
          .setPlaceholder("margin right")
          .setValue(this.config["marginRight"] as string)
          .onChange((value) => {
            this.config["marginRight"] = value;
          });
      });
    btmEl.settingEl.hidden = this.config["marginType"] != "3";

    new Setting(contentEl).setName("Downscale precent").addSlider((slider) => {
      slider
        .setLimits(0, 100, 1)
        .setValue(this.config["scale"] as number)
        .onChange(async (value) => {
          this.config["scale"] = value;
          slider.showTooltip();
        });
    });
    new Setting(contentEl).setName("Landscape").addToggle((toggle) =>
      toggle
        .setTooltip("landscape")
        .setValue(this.config["landscape"])
        .onChange(async (value) => {
          this.config["landscape"] = value;
        }),
    );

    new Setting(contentEl).setName("Display header/footer").addToggle((toggle) =>
      toggle
        .setTooltip("Display header/footer")
        .setValue(this.config["displayHeaderFooter"])
        .onChange(async (value) => {
          this.config["displayHeaderFooter"] = value;
        }),
    );

    new Setting(contentEl).setName("Open after export").addToggle((toggle) =>
      toggle
        .setTooltip("Open the exported file after exporting.")
        .setValue(this.config["open"])
        .onChange(async (value) => {
          this.config["open"] = value;
        }),
    );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    electron.webFrame.setZoomLevel(0);
  }
}
