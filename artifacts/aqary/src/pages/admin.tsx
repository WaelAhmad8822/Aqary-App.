import { Navbar } from "@/components/layout/Navbar";
import { 
  useAdminGetAnalytics, 
  useAdminListProperties, 
  useAdminApproveProperty, 
  useAdminRejectProperty,
  useAdminListUsers,
  useAdminListFeedbacks,
  useAdminResolveFeedback
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Users, Home, Activity, CheckCircle, XCircle, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

export default function Admin() {
  const { toast } = useToast();
  
  const { data: analytics, isLoading: isAnalyticsLoading } = useAdminGetAnalytics({ query: { queryKey: ["admin-analytics"] }});
  const { data: properties, isLoading: isPropsLoading, refetch: refetchProps } = useAdminListProperties({ query: { queryKey: ["admin-properties"] }});
  const { data: users, isLoading: isUsersLoading } = useAdminListUsers({ query: { queryKey: ["admin-users"] }});
  const { data: feedbacks, isLoading: isFeedbacksLoading, refetch: refetchFeedbacks } = useAdminListFeedbacks({ query: { queryKey: ["admin-feedbacks"] }});

  const approveMutation = useAdminApproveProperty();
  const rejectMutation = useAdminRejectProperty();
  const resolveFeedbackMutation = useAdminResolveFeedback();

  const handleApprove = async (id: number) => {
    try {
      await approveMutation.mutateAsync({ id });
      toast({ title: "تم الموافقة على العقار" });
      refetchProps();
    } catch {
      toast({ title: "حدث خطأ", variant: "destructive" });
    }
  };

  const handleReject = async (id: number) => {
    try {
      await rejectMutation.mutateAsync({ id });
      toast({ title: "تم رفض العقار" });
      refetchProps();
    } catch {
      toast({ title: "حدث خطأ", variant: "destructive" });
    }
  };

  const handleResolveFeedback = async (id: number) => {
    try {
      await resolveFeedbackMutation.mutateAsync({ id });
      toast({ title: "تم تحديد الشكوى كمحلولة" });
      refetchFeedbacks();
    } catch {
      toast({ title: "حدث خطأ", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      <Navbar />
      
      <main className="flex-1 container px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">لوحة الإدارة</h1>

        {isAnalyticsLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <Card>
              <CardContent className="p-6 flex flex-col gap-2">
                <Users className="w-6 h-6 text-blue-500 mb-2" />
                <p className="text-sm text-muted-foreground">المستخدمين</p>
                <p className="text-3xl font-bold">{analytics?.totalUsers || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 flex flex-col gap-2">
                <Home className="w-6 h-6 text-primary mb-2" />
                <p className="text-sm text-muted-foreground">إجمالي العقارات</p>
                <p className="text-3xl font-bold">{analytics?.totalProperties || 0}</p>
              </CardContent>
            </Card>
            <Card className={analytics?.pendingProperties ? "border-amber-500 bg-amber-50 dark:bg-amber-950/20" : ""}>
              <CardContent className="p-6 flex flex-col gap-2">
                <CheckCircle className={`w-6 h-6 mb-2 ${analytics?.pendingProperties ? "text-amber-500" : "text-emerald-500"}`} />
                <p className="text-sm text-muted-foreground">قيد المراجعة</p>
                <p className="text-3xl font-bold">{analytics?.pendingProperties || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 flex flex-col gap-2">
                <Activity className="w-6 h-6 text-purple-500 mb-2" />
                <p className="text-sm text-muted-foreground">تفاعلات المستخدمين</p>
                <p className="text-3xl font-bold">{analytics?.totalInteractions || 0}</p>
              </CardContent>
            </Card>
            <Card className={analytics?.unresolvedFeedbacks ? "border-destructive bg-destructive/5" : ""}>
              <CardContent className="p-6 flex flex-col gap-2">
                <MessageSquare className={`w-6 h-6 mb-2 ${analytics?.unresolvedFeedbacks ? "text-destructive" : "text-muted-foreground"}`} />
                <p className="text-sm text-muted-foreground">شكاوى غير محلولة</p>
                <p className="text-3xl font-bold">{analytics?.unresolvedFeedbacks || 0}</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs defaultValue="properties" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8">
            <TabsTrigger value="properties">العقارات والمراجعة</TabsTrigger>
            <TabsTrigger value="users">المستخدمين</TabsTrigger>
            <TabsTrigger value="feedback">الشكاوى والمقترحات</TabsTrigger>
          </TabsList>
          
          <TabsContent value="properties" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>إدارة العقارات</CardTitle>
              </CardHeader>
              <CardContent>
                {isPropsLoading ? (
                  <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>العنوان</TableHead>
                        <TableHead>البائع</TableHead>
                        <TableHead>السعر</TableHead>
                        <TableHead>التاريخ</TableHead>
                        <TableHead>الحالة</TableHead>
                        <TableHead>الإجراءات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {properties?.map((prop) => (
                        <TableRow key={prop.id}>
                          <TableCell className="font-medium max-w-[200px] truncate">{prop.title}</TableCell>
                          <TableCell>{prop.sellerId}</TableCell>
                          <TableCell>{prop.price}</TableCell>
                          <TableCell>{format(new Date(prop.createdAt), 'yyyy/MM/dd')}</TableCell>
                          <TableCell>
                            <Badge variant={prop.status === 'approved' ? 'default' : prop.status === 'rejected' ? 'destructive' : 'secondary'}>
                              {prop.status === 'approved' ? 'مقبول' : prop.status === 'rejected' ? 'مرفوض' : 'قيد المراجعة'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {prop.status === 'pending' && (
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" className="text-emerald-600 hover:text-emerald-700" onClick={() => handleApprove(prop.id)}>
                                  <CheckCircle className="w-4 h-4 mr-1" /> قبول
                                </Button>
                                <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => handleReject(prop.id)}>
                                  <XCircle className="w-4 h-4 mr-1" /> رفض
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>المستخدمين المسجلين</CardTitle>
              </CardHeader>
              <CardContent>
                {isUsersLoading ? (
                  <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>الاسم</TableHead>
                        <TableHead>البريد</TableHead>
                        <TableHead>الدور</TableHead>
                        <TableHead>التسجيل</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users?.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">{user.name}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {user.role === 'admin' ? 'مدير' : user.role === 'seller' ? 'بائع' : 'مشتري'}
                            </Badge>
                          </TableCell>
                          <TableCell>{format(new Date(user.createdAt), 'yyyy/MM/dd')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="feedback">
            <Card>
              <CardHeader>
                <CardTitle>الشكاوى والمقترحات (الذكاء الاصطناعي)</CardTitle>
              </CardHeader>
              <CardContent>
                {isFeedbacksLoading ? (
                  <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>الرسالة</TableHead>
                        <TableHead>المعايير المحددة</TableHead>
                        <TableHead>التاريخ</TableHead>
                        <TableHead>الحالة</TableHead>
                        <TableHead>إجراء</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {feedbacks?.map((fb) => (
                        <TableRow key={fb.id}>
                          <TableCell className="max-w-[300px] truncate">{fb.message}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{fb.criteria || '-'}</TableCell>
                          <TableCell>{format(new Date(fb.createdAt), 'yyyy/MM/dd')}</TableCell>
                          <TableCell>
                            <Badge variant={fb.resolved ? "outline" : "destructive"}>
                              {fb.resolved ? "تم الحل" : "بانتظار الإجراء"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {!fb.resolved && (
                              <Button size="sm" variant="outline" onClick={() => handleResolveFeedback(fb.id)}>
                                تحديد كمحلول
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
