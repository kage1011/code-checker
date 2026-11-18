async function test() {
  const diff = `diff --git a/FEA_BusinessLogic/WarehouseArea/PackingManifestManager.cs b/FEA_BusinessLogic/WarehouseArea/PackingManifestManager.cs
@@ -30,7 +30,8 @@ namespace FEA_BusinessLogic.WarehouseArea
             public static string WashKeepSample = "WKS";
-            public static string Azitzia = "ARZ";
+            public static string ARITZIA = "ARZ";
+            public static string Azitzia = "Azitzia";
`;

  console.log('Calling DeepSeek-R1...');
  const t0 = Date.now();
  const res = await fetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek-r1:8b',
      messages: [
        {
          role: 'system',
          content: 'You are an expert code reviewer. Analyze the diff and output ONLY a JSON array of issues. Do not write explanations outside JSON.'
        },
        {
          role: 'user',
          content: 'Return a JSON array of logic bugs or naming issues in this diff:\n' + diff
        }
      ],
      stream: false,
      options: { num_predict: 800, temperature: 0.1 }
    })
  });

  const data = await res.json();
  console.log('Duration:', (Date.now() - t0) / 1000, 's');
  console.log('CONTENT:\n', data.message.content);
}

test();
