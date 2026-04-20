// @generated
/// Generated client implementations.
pub mod ameliso_service_client {
    #![allow(
        unused_variables,
        dead_code,
        missing_docs,
        clippy::wildcard_imports,
        clippy::let_unit_value,
    )]
    use tonic::codegen::*;
    use tonic::codegen::http::Uri;
    #[derive(Debug, Clone)]
    pub struct AmelisoServiceClient<T> {
        inner: tonic::client::Grpc<T>,
    }
    impl AmelisoServiceClient<tonic::transport::Channel> {
        /// Attempt to create a new client by connecting to a given endpoint.
        pub async fn connect<D>(dst: D) -> Result<Self, tonic::transport::Error>
        where
            D: TryInto<tonic::transport::Endpoint>,
            D::Error: Into<StdError>,
        {
            let conn = tonic::transport::Endpoint::new(dst)?.connect().await?;
            Ok(Self::new(conn))
        }
    }
    impl<T> AmelisoServiceClient<T>
    where
        T: tonic::client::GrpcService<tonic::body::Body>,
        T::Error: Into<StdError>,
        T::ResponseBody: Body<Data = Bytes> + std::marker::Send + 'static,
        <T::ResponseBody as Body>::Error: Into<StdError> + std::marker::Send,
    {
        pub fn new(inner: T) -> Self {
            let inner = tonic::client::Grpc::new(inner);
            Self { inner }
        }
        pub fn with_origin(inner: T, origin: Uri) -> Self {
            let inner = tonic::client::Grpc::with_origin(inner, origin);
            Self { inner }
        }
        pub fn with_interceptor<F>(
            inner: T,
            interceptor: F,
        ) -> AmelisoServiceClient<InterceptedService<T, F>>
        where
            F: tonic::service::Interceptor,
            T::ResponseBody: Default,
            T: tonic::codegen::Service<
                http::Request<tonic::body::Body>,
                Response = http::Response<
                    <T as tonic::client::GrpcService<tonic::body::Body>>::ResponseBody,
                >,
            >,
            <T as tonic::codegen::Service<
                http::Request<tonic::body::Body>,
            >>::Error: Into<StdError> + std::marker::Send + std::marker::Sync,
        {
            AmelisoServiceClient::new(InterceptedService::new(inner, interceptor))
        }
        /// Compress requests with the given encoding.
        ///
        /// This requires the server to support it otherwise it might respond with an
        /// error.
        #[must_use]
        pub fn send_compressed(mut self, encoding: CompressionEncoding) -> Self {
            self.inner = self.inner.send_compressed(encoding);
            self
        }
        /// Enable decompressing responses.
        #[must_use]
        pub fn accept_compressed(mut self, encoding: CompressionEncoding) -> Self {
            self.inner = self.inner.accept_compressed(encoding);
            self
        }
        /// Limits the maximum size of a decoded message.
        ///
        /// Default: `4MB`
        #[must_use]
        pub fn max_decoding_message_size(mut self, limit: usize) -> Self {
            self.inner = self.inner.max_decoding_message_size(limit);
            self
        }
        /// Limits the maximum size of an encoded message.
        ///
        /// Default: `usize::MAX`
        #[must_use]
        pub fn max_encoding_message_size(mut self, limit: usize) -> Self {
            self.inner = self.inner.max_encoding_message_size(limit);
            self
        }
        pub async fn list_cases(
            &mut self,
            request: impl tonic::IntoRequest<super::ListCasesRequest>,
        ) -> std::result::Result<
            tonic::Response<super::ListCasesResponse>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/ameliso.v1.AmelisoService/ListCases",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(GrpcMethod::new("ameliso.v1.AmelisoService", "ListCases"));
            self.inner.unary(req, path, codec).await
        }
        pub async fn get_case(
            &mut self,
            request: impl tonic::IntoRequest<super::GetCaseRequest>,
        ) -> std::result::Result<
            tonic::Response<super::GetCaseResponse>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/ameliso.v1.AmelisoService/GetCase",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(GrpcMethod::new("ameliso.v1.AmelisoService", "GetCase"));
            self.inner.unary(req, path, codec).await
        }
        pub async fn create_case(
            &mut self,
            request: impl tonic::IntoRequest<super::CreateCaseRequest>,
        ) -> std::result::Result<
            tonic::Response<super::CreateCaseResponse>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/ameliso.v1.AmelisoService/CreateCase",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(GrpcMethod::new("ameliso.v1.AmelisoService", "CreateCase"));
            self.inner.unary(req, path, codec).await
        }
        pub async fn update_case(
            &mut self,
            request: impl tonic::IntoRequest<super::UpdateCaseRequest>,
        ) -> std::result::Result<
            tonic::Response<super::UpdateCaseResponse>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/ameliso.v1.AmelisoService/UpdateCase",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(GrpcMethod::new("ameliso.v1.AmelisoService", "UpdateCase"));
            self.inner.unary(req, path, codec).await
        }
        pub async fn list_suites(
            &mut self,
            request: impl tonic::IntoRequest<super::ListSuitesRequest>,
        ) -> std::result::Result<
            tonic::Response<super::ListSuitesResponse>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/ameliso.v1.AmelisoService/ListSuites",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(GrpcMethod::new("ameliso.v1.AmelisoService", "ListSuites"));
            self.inner.unary(req, path, codec).await
        }
        pub async fn get_suite(
            &mut self,
            request: impl tonic::IntoRequest<super::GetSuiteRequest>,
        ) -> std::result::Result<
            tonic::Response<super::GetSuiteResponse>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/ameliso.v1.AmelisoService/GetSuite",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(GrpcMethod::new("ameliso.v1.AmelisoService", "GetSuite"));
            self.inner.unary(req, path, codec).await
        }
        pub async fn create_suite(
            &mut self,
            request: impl tonic::IntoRequest<super::CreateSuiteRequest>,
        ) -> std::result::Result<
            tonic::Response<super::CreateSuiteResponse>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/ameliso.v1.AmelisoService/CreateSuite",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(GrpcMethod::new("ameliso.v1.AmelisoService", "CreateSuite"));
            self.inner.unary(req, path, codec).await
        }
        pub async fn list_runs(
            &mut self,
            request: impl tonic::IntoRequest<super::ListRunsRequest>,
        ) -> std::result::Result<
            tonic::Response<super::ListRunsResponse>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/ameliso.v1.AmelisoService/ListRuns",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(GrpcMethod::new("ameliso.v1.AmelisoService", "ListRuns"));
            self.inner.unary(req, path, codec).await
        }
        pub async fn get_run(
            &mut self,
            request: impl tonic::IntoRequest<super::GetRunRequest>,
        ) -> std::result::Result<tonic::Response<super::GetRunResponse>, tonic::Status> {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/ameliso.v1.AmelisoService/GetRun",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(GrpcMethod::new("ameliso.v1.AmelisoService", "GetRun"));
            self.inner.unary(req, path, codec).await
        }
        pub async fn create_run(
            &mut self,
            request: impl tonic::IntoRequest<super::CreateRunRequest>,
        ) -> std::result::Result<
            tonic::Response<super::CreateRunResponse>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/ameliso.v1.AmelisoService/CreateRun",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(GrpcMethod::new("ameliso.v1.AmelisoService", "CreateRun"));
            self.inner.unary(req, path, codec).await
        }
        pub async fn record_result(
            &mut self,
            request: impl tonic::IntoRequest<super::RecordResultRequest>,
        ) -> std::result::Result<
            tonic::Response<super::RecordResultResponse>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/ameliso.v1.AmelisoService/RecordResult",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(GrpcMethod::new("ameliso.v1.AmelisoService", "RecordResult"));
            self.inner.unary(req, path, codec).await
        }
        pub async fn finalize_run(
            &mut self,
            request: impl tonic::IntoRequest<super::FinalizeRunRequest>,
        ) -> std::result::Result<
            tonic::Response<super::FinalizeRunResponse>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/ameliso.v1.AmelisoService/FinalizeRun",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(GrpcMethod::new("ameliso.v1.AmelisoService", "FinalizeRun"));
            self.inner.unary(req, path, codec).await
        }
        pub async fn get_coverage_report(
            &mut self,
            request: impl tonic::IntoRequest<super::GetCoverageReportRequest>,
        ) -> std::result::Result<
            tonic::Response<super::GetCoverageReportResponse>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/ameliso.v1.AmelisoService/GetCoverageReport",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new("ameliso.v1.AmelisoService", "GetCoverageReport"),
                );
            self.inner.unary(req, path, codec).await
        }
        pub async fn get_affected_cases(
            &mut self,
            request: impl tonic::IntoRequest<super::GetAffectedCasesRequest>,
        ) -> std::result::Result<
            tonic::Response<super::GetAffectedCasesResponse>,
            tonic::Status,
        > {
            self.inner
                .ready()
                .await
                .map_err(|e| {
                    tonic::Status::unknown(
                        format!("Service was not ready: {}", e.into()),
                    )
                })?;
            let codec = tonic_prost::ProstCodec::default();
            let path = http::uri::PathAndQuery::from_static(
                "/ameliso.v1.AmelisoService/GetAffectedCases",
            );
            let mut req = request.into_request();
            req.extensions_mut()
                .insert(
                    GrpcMethod::new("ameliso.v1.AmelisoService", "GetAffectedCases"),
                );
            self.inner.unary(req, path, codec).await
        }
    }
}
/// Generated server implementations.
pub mod ameliso_service_server {
    #![allow(
        unused_variables,
        dead_code,
        missing_docs,
        clippy::wildcard_imports,
        clippy::let_unit_value,
    )]
    use tonic::codegen::*;
    /// Generated trait containing gRPC methods that should be implemented for use with AmelisoServiceServer.
    #[async_trait]
    pub trait AmelisoService: std::marker::Send + std::marker::Sync + 'static {
        async fn list_cases(
            &self,
            request: tonic::Request<super::ListCasesRequest>,
        ) -> std::result::Result<
            tonic::Response<super::ListCasesResponse>,
            tonic::Status,
        >;
        async fn get_case(
            &self,
            request: tonic::Request<super::GetCaseRequest>,
        ) -> std::result::Result<tonic::Response<super::GetCaseResponse>, tonic::Status>;
        async fn create_case(
            &self,
            request: tonic::Request<super::CreateCaseRequest>,
        ) -> std::result::Result<
            tonic::Response<super::CreateCaseResponse>,
            tonic::Status,
        >;
        async fn update_case(
            &self,
            request: tonic::Request<super::UpdateCaseRequest>,
        ) -> std::result::Result<
            tonic::Response<super::UpdateCaseResponse>,
            tonic::Status,
        >;
        async fn list_suites(
            &self,
            request: tonic::Request<super::ListSuitesRequest>,
        ) -> std::result::Result<
            tonic::Response<super::ListSuitesResponse>,
            tonic::Status,
        >;
        async fn get_suite(
            &self,
            request: tonic::Request<super::GetSuiteRequest>,
        ) -> std::result::Result<
            tonic::Response<super::GetSuiteResponse>,
            tonic::Status,
        >;
        async fn create_suite(
            &self,
            request: tonic::Request<super::CreateSuiteRequest>,
        ) -> std::result::Result<
            tonic::Response<super::CreateSuiteResponse>,
            tonic::Status,
        >;
        async fn list_runs(
            &self,
            request: tonic::Request<super::ListRunsRequest>,
        ) -> std::result::Result<
            tonic::Response<super::ListRunsResponse>,
            tonic::Status,
        >;
        async fn get_run(
            &self,
            request: tonic::Request<super::GetRunRequest>,
        ) -> std::result::Result<tonic::Response<super::GetRunResponse>, tonic::Status>;
        async fn create_run(
            &self,
            request: tonic::Request<super::CreateRunRequest>,
        ) -> std::result::Result<
            tonic::Response<super::CreateRunResponse>,
            tonic::Status,
        >;
        async fn record_result(
            &self,
            request: tonic::Request<super::RecordResultRequest>,
        ) -> std::result::Result<
            tonic::Response<super::RecordResultResponse>,
            tonic::Status,
        >;
        async fn finalize_run(
            &self,
            request: tonic::Request<super::FinalizeRunRequest>,
        ) -> std::result::Result<
            tonic::Response<super::FinalizeRunResponse>,
            tonic::Status,
        >;
        async fn get_coverage_report(
            &self,
            request: tonic::Request<super::GetCoverageReportRequest>,
        ) -> std::result::Result<
            tonic::Response<super::GetCoverageReportResponse>,
            tonic::Status,
        >;
        async fn get_affected_cases(
            &self,
            request: tonic::Request<super::GetAffectedCasesRequest>,
        ) -> std::result::Result<
            tonic::Response<super::GetAffectedCasesResponse>,
            tonic::Status,
        >;
    }
    #[derive(Debug)]
    pub struct AmelisoServiceServer<T> {
        inner: Arc<T>,
        accept_compression_encodings: EnabledCompressionEncodings,
        send_compression_encodings: EnabledCompressionEncodings,
        max_decoding_message_size: Option<usize>,
        max_encoding_message_size: Option<usize>,
    }
    impl<T> AmelisoServiceServer<T> {
        pub fn new(inner: T) -> Self {
            Self::from_arc(Arc::new(inner))
        }
        pub fn from_arc(inner: Arc<T>) -> Self {
            Self {
                inner,
                accept_compression_encodings: Default::default(),
                send_compression_encodings: Default::default(),
                max_decoding_message_size: None,
                max_encoding_message_size: None,
            }
        }
        pub fn with_interceptor<F>(
            inner: T,
            interceptor: F,
        ) -> InterceptedService<Self, F>
        where
            F: tonic::service::Interceptor,
        {
            InterceptedService::new(Self::new(inner), interceptor)
        }
        /// Enable decompressing requests with the given encoding.
        #[must_use]
        pub fn accept_compressed(mut self, encoding: CompressionEncoding) -> Self {
            self.accept_compression_encodings.enable(encoding);
            self
        }
        /// Compress responses with the given encoding, if the client supports it.
        #[must_use]
        pub fn send_compressed(mut self, encoding: CompressionEncoding) -> Self {
            self.send_compression_encodings.enable(encoding);
            self
        }
        /// Limits the maximum size of a decoded message.
        ///
        /// Default: `4MB`
        #[must_use]
        pub fn max_decoding_message_size(mut self, limit: usize) -> Self {
            self.max_decoding_message_size = Some(limit);
            self
        }
        /// Limits the maximum size of an encoded message.
        ///
        /// Default: `usize::MAX`
        #[must_use]
        pub fn max_encoding_message_size(mut self, limit: usize) -> Self {
            self.max_encoding_message_size = Some(limit);
            self
        }
    }
    impl<T, B> tonic::codegen::Service<http::Request<B>> for AmelisoServiceServer<T>
    where
        T: AmelisoService,
        B: Body + std::marker::Send + 'static,
        B::Error: Into<StdError> + std::marker::Send + 'static,
    {
        type Response = http::Response<tonic::body::Body>;
        type Error = std::convert::Infallible;
        type Future = BoxFuture<Self::Response, Self::Error>;
        fn poll_ready(
            &mut self,
            _cx: &mut Context<'_>,
        ) -> Poll<std::result::Result<(), Self::Error>> {
            Poll::Ready(Ok(()))
        }
        fn call(&mut self, req: http::Request<B>) -> Self::Future {
            match req.uri().path() {
                "/ameliso.v1.AmelisoService/ListCases" => {
                    #[allow(non_camel_case_types)]
                    struct ListCasesSvc<T: AmelisoService>(pub Arc<T>);
                    impl<
                        T: AmelisoService,
                    > tonic::server::UnaryService<super::ListCasesRequest>
                    for ListCasesSvc<T> {
                        type Response = super::ListCasesResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::ListCasesRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as AmelisoService>::list_cases(&inner, request).await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = ListCasesSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/ameliso.v1.AmelisoService/GetCase" => {
                    #[allow(non_camel_case_types)]
                    struct GetCaseSvc<T: AmelisoService>(pub Arc<T>);
                    impl<
                        T: AmelisoService,
                    > tonic::server::UnaryService<super::GetCaseRequest>
                    for GetCaseSvc<T> {
                        type Response = super::GetCaseResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::GetCaseRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as AmelisoService>::get_case(&inner, request).await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = GetCaseSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/ameliso.v1.AmelisoService/CreateCase" => {
                    #[allow(non_camel_case_types)]
                    struct CreateCaseSvc<T: AmelisoService>(pub Arc<T>);
                    impl<
                        T: AmelisoService,
                    > tonic::server::UnaryService<super::CreateCaseRequest>
                    for CreateCaseSvc<T> {
                        type Response = super::CreateCaseResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::CreateCaseRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as AmelisoService>::create_case(&inner, request).await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = CreateCaseSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/ameliso.v1.AmelisoService/UpdateCase" => {
                    #[allow(non_camel_case_types)]
                    struct UpdateCaseSvc<T: AmelisoService>(pub Arc<T>);
                    impl<
                        T: AmelisoService,
                    > tonic::server::UnaryService<super::UpdateCaseRequest>
                    for UpdateCaseSvc<T> {
                        type Response = super::UpdateCaseResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::UpdateCaseRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as AmelisoService>::update_case(&inner, request).await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = UpdateCaseSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/ameliso.v1.AmelisoService/ListSuites" => {
                    #[allow(non_camel_case_types)]
                    struct ListSuitesSvc<T: AmelisoService>(pub Arc<T>);
                    impl<
                        T: AmelisoService,
                    > tonic::server::UnaryService<super::ListSuitesRequest>
                    for ListSuitesSvc<T> {
                        type Response = super::ListSuitesResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::ListSuitesRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as AmelisoService>::list_suites(&inner, request).await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = ListSuitesSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/ameliso.v1.AmelisoService/GetSuite" => {
                    #[allow(non_camel_case_types)]
                    struct GetSuiteSvc<T: AmelisoService>(pub Arc<T>);
                    impl<
                        T: AmelisoService,
                    > tonic::server::UnaryService<super::GetSuiteRequest>
                    for GetSuiteSvc<T> {
                        type Response = super::GetSuiteResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::GetSuiteRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as AmelisoService>::get_suite(&inner, request).await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = GetSuiteSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/ameliso.v1.AmelisoService/CreateSuite" => {
                    #[allow(non_camel_case_types)]
                    struct CreateSuiteSvc<T: AmelisoService>(pub Arc<T>);
                    impl<
                        T: AmelisoService,
                    > tonic::server::UnaryService<super::CreateSuiteRequest>
                    for CreateSuiteSvc<T> {
                        type Response = super::CreateSuiteResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::CreateSuiteRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as AmelisoService>::create_suite(&inner, request).await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = CreateSuiteSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/ameliso.v1.AmelisoService/ListRuns" => {
                    #[allow(non_camel_case_types)]
                    struct ListRunsSvc<T: AmelisoService>(pub Arc<T>);
                    impl<
                        T: AmelisoService,
                    > tonic::server::UnaryService<super::ListRunsRequest>
                    for ListRunsSvc<T> {
                        type Response = super::ListRunsResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::ListRunsRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as AmelisoService>::list_runs(&inner, request).await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = ListRunsSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/ameliso.v1.AmelisoService/GetRun" => {
                    #[allow(non_camel_case_types)]
                    struct GetRunSvc<T: AmelisoService>(pub Arc<T>);
                    impl<
                        T: AmelisoService,
                    > tonic::server::UnaryService<super::GetRunRequest>
                    for GetRunSvc<T> {
                        type Response = super::GetRunResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::GetRunRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as AmelisoService>::get_run(&inner, request).await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = GetRunSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/ameliso.v1.AmelisoService/CreateRun" => {
                    #[allow(non_camel_case_types)]
                    struct CreateRunSvc<T: AmelisoService>(pub Arc<T>);
                    impl<
                        T: AmelisoService,
                    > tonic::server::UnaryService<super::CreateRunRequest>
                    for CreateRunSvc<T> {
                        type Response = super::CreateRunResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::CreateRunRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as AmelisoService>::create_run(&inner, request).await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = CreateRunSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/ameliso.v1.AmelisoService/RecordResult" => {
                    #[allow(non_camel_case_types)]
                    struct RecordResultSvc<T: AmelisoService>(pub Arc<T>);
                    impl<
                        T: AmelisoService,
                    > tonic::server::UnaryService<super::RecordResultRequest>
                    for RecordResultSvc<T> {
                        type Response = super::RecordResultResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::RecordResultRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as AmelisoService>::record_result(&inner, request).await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = RecordResultSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/ameliso.v1.AmelisoService/FinalizeRun" => {
                    #[allow(non_camel_case_types)]
                    struct FinalizeRunSvc<T: AmelisoService>(pub Arc<T>);
                    impl<
                        T: AmelisoService,
                    > tonic::server::UnaryService<super::FinalizeRunRequest>
                    for FinalizeRunSvc<T> {
                        type Response = super::FinalizeRunResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::FinalizeRunRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as AmelisoService>::finalize_run(&inner, request).await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = FinalizeRunSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/ameliso.v1.AmelisoService/GetCoverageReport" => {
                    #[allow(non_camel_case_types)]
                    struct GetCoverageReportSvc<T: AmelisoService>(pub Arc<T>);
                    impl<
                        T: AmelisoService,
                    > tonic::server::UnaryService<super::GetCoverageReportRequest>
                    for GetCoverageReportSvc<T> {
                        type Response = super::GetCoverageReportResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::GetCoverageReportRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as AmelisoService>::get_coverage_report(&inner, request)
                                    .await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = GetCoverageReportSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                "/ameliso.v1.AmelisoService/GetAffectedCases" => {
                    #[allow(non_camel_case_types)]
                    struct GetAffectedCasesSvc<T: AmelisoService>(pub Arc<T>);
                    impl<
                        T: AmelisoService,
                    > tonic::server::UnaryService<super::GetAffectedCasesRequest>
                    for GetAffectedCasesSvc<T> {
                        type Response = super::GetAffectedCasesResponse;
                        type Future = BoxFuture<
                            tonic::Response<Self::Response>,
                            tonic::Status,
                        >;
                        fn call(
                            &mut self,
                            request: tonic::Request<super::GetAffectedCasesRequest>,
                        ) -> Self::Future {
                            let inner = Arc::clone(&self.0);
                            let fut = async move {
                                <T as AmelisoService>::get_affected_cases(&inner, request)
                                    .await
                            };
                            Box::pin(fut)
                        }
                    }
                    let accept_compression_encodings = self.accept_compression_encodings;
                    let send_compression_encodings = self.send_compression_encodings;
                    let max_decoding_message_size = self.max_decoding_message_size;
                    let max_encoding_message_size = self.max_encoding_message_size;
                    let inner = self.inner.clone();
                    let fut = async move {
                        let method = GetAffectedCasesSvc(inner);
                        let codec = tonic_prost::ProstCodec::default();
                        let mut grpc = tonic::server::Grpc::new(codec)
                            .apply_compression_config(
                                accept_compression_encodings,
                                send_compression_encodings,
                            )
                            .apply_max_message_size_config(
                                max_decoding_message_size,
                                max_encoding_message_size,
                            );
                        let res = grpc.unary(method, req).await;
                        Ok(res)
                    };
                    Box::pin(fut)
                }
                _ => {
                    Box::pin(async move {
                        let mut response = http::Response::new(
                            tonic::body::Body::default(),
                        );
                        let headers = response.headers_mut();
                        headers
                            .insert(
                                tonic::Status::GRPC_STATUS,
                                (tonic::Code::Unimplemented as i32).into(),
                            );
                        headers
                            .insert(
                                http::header::CONTENT_TYPE,
                                tonic::metadata::GRPC_CONTENT_TYPE,
                            );
                        Ok(response)
                    })
                }
            }
        }
    }
    impl<T> Clone for AmelisoServiceServer<T> {
        fn clone(&self) -> Self {
            let inner = self.inner.clone();
            Self {
                inner,
                accept_compression_encodings: self.accept_compression_encodings,
                send_compression_encodings: self.send_compression_encodings,
                max_decoding_message_size: self.max_decoding_message_size,
                max_encoding_message_size: self.max_encoding_message_size,
            }
        }
    }
    /// Generated gRPC service name
    pub const SERVICE_NAME: &str = "ameliso.v1.AmelisoService";
    impl<T> tonic::server::NamedService for AmelisoServiceServer<T> {
        const NAME: &'static str = SERVICE_NAME;
    }
}
