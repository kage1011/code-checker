using OfficeOpenXml;
using System.Drawing;
public class CFAController {
    public void ExportExceptionDefectCfa(string dateFrom, string dateTo)
    {
        List<object> listsum = new List<object>();
        string sFileName = @"CFAReport.xlsx";
        if (UserLoginInfo.CompanyCode == 7910 || UserLoginInfo.CompanyCode == 7920) sFileName = @"CFAReport_VSIP1.xlsx";
        string borderRange = "A6:CV";
        using (ExcelPackage package = new ExcelPackage(file))
        {
            ExcelWorksheet worksheet = package.Workbook.Worksheets[1];
            int row = 6; int col = 1;
            foreach (var t in listsum)
            {
                worksheet.Cells[row, col++].Value = t.Brand;
                worksheet.Cells[row, col++].Value = t.CheckDate;
                worksheet.Cells[row, col++].Value = t.CustomerStyle;
                if (UserLoginInfo.CompanyCode == 79101)
                {
                    worksheet.Cells[row, col++].Value = t.C201;
                }
                else
                {
                    worksheet.Cells[row, col++].Value = t.C201_1;
                    worksheet.Cells[row, col++].Value = t.C201_2;
                    worksheet.Cells[row, col++].Value = t.C201_3;
                }
                col = 1; row++;
            }
            using (ExcelRange range = worksheet.Cells[borderRange + (listsum.Count + 6)])
            {
                range.Style.Border.Top.Style = ExcelBorderStyle.Thin;
            }
        }
    }
}
